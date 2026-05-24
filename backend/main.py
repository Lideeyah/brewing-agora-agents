"""
Brewing Arc API — FastAPI backend
B2B AI task marketplace on Circle Arc L1.

Run locally:
    cd ~/arc
    uvicorn backend.main:app --reload --port 8000
"""
import asyncio
import os
import time
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env", override=True)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.brewing_sdk    import BrewingArcClient
from backend.registry       import registry, compute_reputation
from backend.circle_wallets import provision_agent_wallet
from backend.receipts       import sign_receipt, receipt_store
from backend.tasks          import task_store, TaskRecord
from backend.businesses     import business_store

# ── App lifecycle ─────────────────────────────────────────────────────────────

client: BrewingArcClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    client = BrewingArcClient()
    _seed_registry()
    yield


def _seed_registry():
    import hashlib
    specs = [
        ("ResearchBot",  ["research", "market-analysis", "literature-review", "summarization"]),
        ("AnalystBot",   ["analysis", "data", "financial", "risk-assessment", "comparison"]),
        ("StrategyBot",  ["strategy", "planning", "recommendations", "decision-support"]),
    ]
    owner = client.account.address
    for name, caps in specs:
        agent_id = hashlib.sha256(f"{owner.lower()}:{name.lower()}".encode()).hexdigest()[:16]
        if registry.get(agent_id):
            continue
        wallet = provision_agent_wallet(name)
        registry.register(
            name         = name,
            owner        = owner,
            payment_addr = wallet.address,
            capabilities = caps,
            endpoint     = f"http://localhost:8000/agents/{name.lower()}",
        )


app = FastAPI(title="Brewing Arc API", version="3.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request models ────────────────────────────────────────────────────────────

class OnboardRequest(BaseModel):
    name:  str
    email: str

class PostTaskRequest(BaseModel):
    description:      str
    budget_usdc:      float
    deadline_hours:   int   = 24
    employer_address: str   = ""
    employer_name:    str   = ""

class PostJobRequest(BaseModel):
    worker:          str
    usdc_amount:     float
    timeout_seconds: int = 3600

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status":   "ok",
        "network":  "arc-testnet",
        "agents":   len(registry.all()),
        "tasks":    len(task_store.all()),
        "receipts": len(receipt_store.all()),
    }

# ── Onboarding ────────────────────────────────────────────────────────────────

@app.post("/api/onboard")
async def onboard(req: OnboardRequest):
    """Create (or retrieve) a Circle DCW wallet for a new business user."""
    existing = business_store.by_email(req.email)
    if existing:
        try:
            bal = await client.native_balance(existing.wallet_address)
        except Exception:
            bal = 0.0
        return {
            "business_id":    existing.business_id,
            "wallet_address": existing.wallet_address,
            "balance_usdc":   bal,
            "existing":       True,
        }

    wallet = provision_agent_wallet(req.name)
    biz    = business_store.create(req.name, req.email, wallet.address, wallet.wallet_id)
    return {
        "business_id":    biz.business_id,
        "wallet_address": wallet.address,
        "balance_usdc":   0.0,
        "existing":       False,
    }

# ── Task marketplace ──────────────────────────────────────────────────────────

@app.post("/api/tasks")
async def post_task(req: PostTaskRequest):
    """
    Full autonomous loop:
    Claude selects agent → lock USDC in escrow → agent runs task → settle → receipt.
    """
    import anthropic as _anthropic

    employer_addr = req.employer_address or client.account.address

    # Create task record immediately
    task = task_store.create(
        employer_address = employer_addr,
        employer_name    = req.employer_name,
        description      = req.description,
        budget_usdc      = req.budget_usdc,
        deadline_hours   = req.deadline_hours,
    )
    task.status = "in_progress"
    task_store.update(task)

    try:
        ai   = _anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))
        loop = asyncio.get_running_loop()

        # 1. Claude selects the best agent for this task
        agents     = registry.all()
        agent_list = "\n".join(
            [f"- {a.name}: {', '.join(a.capabilities[:4])}" for a in agents]
        )
        sel = await loop.run_in_executor(None, lambda: ai.messages.create(
            model      = "claude-haiku-4-5-20251001",
            max_tokens = 20,
            messages   = [{
                "role":    "user",
                "content": (
                    f"Task: {req.description}\n\n"
                    f"Agents:\n{agent_list}\n\n"
                    "Reply with ONLY the agent name that best fits. No explanation."
                ),
            }],
        ))
        chosen_name = sel.content[0].text.strip()
        chosen      = next(
            (a for a in agents if a.name.lower() in chosen_name.lower() or chosen_name.lower() in a.name.lower()),
            agents[0],
        )
        task.agent_name = chosen.name
        task.agent_id   = chosen.agent_id
        task_store.update(task)

        # 2. Lock USDC in escrow
        escrow_result = await client.post_job(
            worker          = chosen.payment_addr,
            usdc_amount     = req.budget_usdc,
            timeout_seconds = req.deadline_hours * 3600,
        )
        task.job_id    = escrow_result["job_id"]
        task.create_tx = escrow_result["create_tx"]
        task_store.update(task)

        # 3. Agent runs the task
        work = await loop.run_in_executor(None, lambda: ai.messages.create(
            model      = "claude-opus-4-5",
            max_tokens = 600,
            messages   = [{
                "role":    "user",
                "content": (
                    f"You are {chosen.name}, a specialized AI agent. "
                    f"Complete this task for a client:\n\n{req.description}\n\n"
                    "Provide a clear, professional response."
                ),
            }],
        ))
        output      = work.content[0].text.strip()
        task.result = output
        task_store.update(task)

        # 4. Release USDC to agent wallet
        settle_tx      = await client.complete_job(task.job_id)
        task.settle_tx = settle_tx

        # 5. Sign on-chain receipt
        employer_key = os.getenv("ARC_PRIVATE_KEY", "")
        if employer_key:
            receipt = sign_receipt(
                job_id          = task.job_id,
                employer_addr   = client.account.address,
                employer_key    = employer_key,
                worker_addr     = chosen.payment_addr,
                worker_agent_id = chosen.agent_id,
                task_type       = chosen.capabilities[0] if chosen.capabilities else "general",
                output_text     = output,
                amount_usdc     = req.budget_usdc,
                tx_hash         = settle_tx,
            )
            receipt_store.save(receipt)
            task.receipt_id = receipt.receipt_id

        registry.record_completion(chosen.agent_id)
        task.status       = "completed"
        task.completed_at = int(time.time())
        task_store.update(task)

        return asdict(task)

    except Exception as e:
        task.status = "refunded"
        task_store.update(task)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tasks")
async def get_tasks():
    return [asdict(t) for t in task_store.all()]


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str):
    t = task_store.get(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    return asdict(t)

# ── Analytics (landing page stats) ────────────────────────────────────────────

@app.get("/api/analytics")
async def analytics():
    try:
        jobs      = await client.get_all_jobs()
        completed = [j for j in jobs if j.status == "Completed"]
        agents    = registry.all()
        tasks     = task_store.all()

        return {
            "metrics": {
                "totalJobsCompleted": len(completed),
                "usdcSettled":        round(sum(j.amount_usdc for j in completed), 2),
                "activeAgents":       len(agents),
                "totalTasks":         len(tasks),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Wallet ─────────────────────────────────────────────────────────────────────

@app.get("/api/wallet")
async def get_wallet():
    addr         = os.getenv("CIRCLE_WALLET_ADDRESS", "")
    balance_usdc = 0.0
    if client and addr:
        try:
            balance_usdc = await client.native_balance(addr)
        except Exception:
            pass
    return {"address": addr, "balance_usdc": round(balance_usdc, 4), "network": "arc-testnet"}

# ── Agents ─────────────────────────────────────────────────────────────────────

@app.get("/api/agents")
async def get_agents():
    return registry.to_dict()

# ── Jobs (raw on-chain) ────────────────────────────────────────────────────────

@app.get("/api/jobs")
async def get_all_jobs():
    try:
        return [j.__dict__ for j in await client.get_all_jobs()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Receipts ──────────────────────────────────────────────────────────────────

@app.get("/api/receipts")
async def get_receipts():
    return [r.to_dict() for r in receipt_store.all()]


@app.get("/api/receipts/{receipt_id}/verify")
async def verify_receipt(receipt_id: str):
    r = receipt_store.get(receipt_id)
    if not r:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return {"receipt_id": receipt_id, "valid": r.verify(), "signer": r.employer}
