"""
Brewing Arc API — FastAPI backend
Exposes escrow actions and job reads over HTTP for the React dashboard.

Run locally:
    cd ~/arc
    uvicorn backend.main:app --reload --port 8000
"""
import asyncio
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env", override=True)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from web3 import Web3

from backend.brewing_sdk import BrewingArcClient, paced_api_call

# ── App lifecycle ─────────────────────────────────────────────────────────────

client: BrewingArcClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    client = BrewingArcClient()
    yield


app = FastAPI(title="Brewing Arc API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request models ────────────────────────────────────────────────────────────

class PostJobRequest(BaseModel):
    worker:          str
    usdc_amount:     float
    timeout_seconds: int = 3600
    description:     str = ""

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "network": "arc-testnet"}


@app.post("/api/jobs")
async def post_job(req: PostJobRequest):
    try:
        result = await paced_api_call(
            client.post_job(req.worker, req.usdc_amount, req.timeout_seconds)
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/jobs/{job_id}/complete")
async def complete_job(job_id: int):
    try:
        tx = await client.complete_job(job_id)
        return {"tx_hash": tx, "job_id": job_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/jobs/{job_id}/slash")
async def slash_job(job_id: int):
    try:
        tx = await client.slash_job(job_id)
        return {"tx_hash": tx, "job_id": job_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: int):
    try:
        job = await client.get_job(job_id)
        return job.__dict__
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/jobs")
async def get_all_jobs():
    try:
        jobs = await client.get_all_jobs()
        return [j.__dict__ for j in jobs]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/demo/run")
async def run_demo():
    """
    Trigger a 3-job Brewing agent demo from the React dashboard.
    Returns a log list the UI can display line by line.
    """
    import anthropic

    log: list[str] = []

    def emit(msg: str):
        ts = time.strftime("%H:%M:%S")
        log.append(f"[{ts}] {msg}")

    try:
        ai_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))

        DEMO_JOBS = [
            {
                "type":   "research",
                "prompt": (
                    "You are a specialist research agent. "
                    "Summarise in 3 bullet points why Arc L1 (Circle's stablecoin-native EVM chain) "
                    "is a better settlement layer for AI agent economies than general-purpose EVM chains. "
                    "Keep each bullet under 25 words."
                ),
            },
            {
                "type":   "strategy",
                "prompt": (
                    "You are a product strategy agent. "
                    "In exactly 2 sentences, explain how Brewing's escrow + SLA slash mechanism "
                    "creates trust between AI agents that have never interacted before."
                ),
            },
        ]

        worker_addr = Web3().eth.account.create().address
        emit(f"Worker wallet: {worker_addr[:10]}…")

        for job_spec in DEMO_JOBS:
            emit(f"Posting {job_spec['type']} job (0.10 USDC, 300s SLA)…")
            result = await client.post_job(worker=worker_addr, usdc_amount=0.10, timeout_seconds=300)
            job_id = result["job_id"]
            emit(f"Job #{job_id} locked in escrow ✓")

            emit("Claude completing task…")
            loop = asyncio.get_running_loop()
            response = await loop.run_in_executor(
                None,
                lambda: ai_client.messages.create(
                    model="claude-opus-4-5",
                    max_tokens=250,
                    messages=[{"role": "user", "content": job_spec["prompt"]}],
                )
            )
            output = response.content[0].text.strip()
            for line in output.split("\n")[:3]:
                if line.strip():
                    emit(f"  {line.strip()[:90]}")

            emit(f"Settling escrow → releasing USDC to worker…")
            await client.complete_job(job_id)
            emit(f"Job #{job_id} settled ✓  0.10 USDC on-chain")
            await asyncio.sleep(1)

        emit("─── BREWING DEMO COMPLETE ───")
    except Exception as e:
        emit(f"Error: {e}")

    return {"log": log}


@app.get("/api/analytics")
async def analytics():
    """
    Summary stats endpoint — same shape as the Solana /api/analytics
    so the React dashboard can swap in with zero frontend changes.
    """
    try:
        jobs      = await client.get_all_jobs()
        completed = [j for j in jobs if j.status == "Completed"]
        slashed   = [j for j in jobs if j.status == "Slashed"]

        return {
            "program": os.getenv("ESCROW_CONTRACT_ADDRESS", "not-deployed"),
            "network": "arc-testnet",
            "metrics": {
                "totalJobs":      len(jobs),
                "completedJobs":  len(completed),
                "slashedJobs":    len(slashed),
                "completionRate": round(len(completed) / len(jobs) * 100, 1) if jobs else 0,
                "usdcSettled":    round(sum(j.amount_usdc for j in completed), 6),
                "usdcSlashed":    round(sum(j.amount_usdc for j in slashed),   6),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
