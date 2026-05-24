"""
Brewing Arc Agent Loop
======================
Demonstrates the full B2B agent economy on Arc L1:

  Poster agent  → create_job (USDC locks in escrow)
  Worker agent  → Claude does the AI task
  Poster agent  → complete_job (USDC releases to worker)

Run:
    cd ~/arc
    python3 -m backend.agent

Flow per job:
  1. Poster creates a job in the escrow contract (0.10 USDC)
  2. Worker agent calls Claude to complete the task
  3. Poster (acting as owner/arbitrator) settles the escrow
  4. Log the Arc explorer TX links
"""
import asyncio
import os
import sys
import json
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env", override=True)

import anthropic
from web3 import Web3
from backend.brewing_sdk import BrewingArcClient, paced_api_call

# ── Config ────────────────────────────────────────────────────────────────────

EXPLORER     = "https://testnet.arcscan.app"
JOB_AMOUNT   = 0.10        # USDC per job
SLA_TIMEOUT  = 300         # 5 minutes SLA
POLL_DELAY   = 4.0         # seconds between poll cycles

# Demo job queue — extend for live use
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
        "type":   "analysis",
        "prompt": (
            "You are a DeFi analyst agent. "
            "List 3 concrete risks of using volatile gas tokens (ETH, MATIC) for autonomous "
            "agent-to-agent micropayments. Keep each risk under 20 words."
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

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg: str):
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

def tx_link(tx_hash: str) -> str:
    h = tx_hash.lstrip("0x")
    return f"{EXPLORER}/tx/0x{h}"

def addr_link(addr: str) -> str:
    return f"{EXPLORER}/address/{addr}"

# ── Worker: Claude does the task ──────────────────────────────────────────────

async def run_worker_task(prompt: str) -> str:
    """Call Claude to complete the assigned task (pacemaker enforced)."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        # Fallback for demo without API key
        return "[DEMO MODE] Claude output placeholder — add ANTHROPIC_API_KEY for live AI."

    client = anthropic.Anthropic(api_key=api_key)

    async def _call():
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: client.messages.create(
                model="claude-opus-4-5",
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )
        )

    response = await paced_api_call(_call())
    return response.content[0].text.strip()

# ── Main agent loop ───────────────────────────────────────────────────────────

async def run_demo():
    log("Brewing Arc Agent — starting up")
    arc = BrewingArcClient()

    # Use a fresh worker address (payment destination — doesn't need to be funded)
    worker_acct = Web3().eth.account.create()
    worker_addr = worker_acct.address
    log(f"Worker wallet:   {worker_addr}")
    log(f"Employer wallet: {arc.account.address}")
    log(f"Escrow contract: {arc.escrow.address}")
    log(f"Explorer:        {addr_link(arc.escrow.address)}")
    log("─" * 60)

    results = []

    for i, job_spec in enumerate(DEMO_JOBS, 1):
        log(f"\nJob {i}/{len(DEMO_JOBS)} — type: {job_spec['type']}")

        # ── Step 1: Post job & lock USDC ──────────────────────────────────────
        log(f"  Posting job to escrow ({JOB_AMOUNT} USDC, {SLA_TIMEOUT}s SLA)...")
        try:
            result = await arc.post_job(
                worker=worker_addr,
                usdc_amount=JOB_AMOUNT,
                timeout_seconds=SLA_TIMEOUT,
            )
            job_id    = result["job_id"]
            create_tx = result["create_tx"]
            log(f"  ✓ Job #{job_id} created — USDC locked in escrow")
            log(f"    TX: {tx_link(create_tx)}")
        except Exception as e:
            log(f"  ✗ create_job failed: {e}")
            continue

        # ── Step 2: Worker runs Claude ─────────────────────────────────────────
        log(f"  Worker agent running Claude task...")
        task_output = await run_worker_task(job_spec["prompt"])
        log(f"  ✓ Task completed:")
        for line in task_output.split("\n"):
            log(f"      {line}")

        # ── Step 3: Employer settles escrow ────────────────────────────────────
        log(f"  Settling escrow (releasing USDC to worker)...")
        try:
            settle_tx = await arc.complete_job(job_id)
            log(f"  ✓ Job #{job_id} settled — {JOB_AMOUNT} USDC → {worker_addr[:10]}...")
            log(f"    TX: {tx_link(settle_tx)}")
        except Exception as e:
            log(f"  ✗ complete_job failed: {e}")

        results.append({
            "job_id":    job_id,
            "type":      job_spec["type"],
            "output":    task_output,
            "create_tx": create_tx,
            "settle_tx": settle_tx if "settle_tx" in dir() else None,
        })

        log(f"  ─ Job {i} done ─")
        await asyncio.sleep(POLL_DELAY)

    # ── Summary ───────────────────────────────────────────────────────────────
    log("\n" + "═" * 60)
    log("BREWING DEMO COMPLETE")
    log("═" * 60)

    analytics = await arc.get_all_jobs()
    completed = [j for j in analytics if j.status == "Completed"]
    total_usdc = sum(j.amount_usdc for j in completed)

    log(f"Jobs posted:    {len(DEMO_JOBS)}")
    log(f"Jobs settled:   {len(completed)}")
    log(f"USDC settled:   {total_usdc:.2f}")
    log(f"Contract:       {addr_link(arc.escrow.address)}")
    log(f"Explorer:       {EXPLORER}")
    log("")
    log("All transactions verifiable on Arc testnet:")
    for r in results:
        log(f"  Job #{r['job_id']} ({r['type']}): {tx_link(r['create_tx'])}")


# ── Adversarial demo: show slash ──────────────────────────────────────────────

async def run_slash_demo():
    """Demonstrate SLA breach → slash → employer refund."""
    log("\nAdversarial demo: SLA breach → slash")
    arc = BrewingArcClient()

    worker_acct = Web3().eth.account.create()

    log("  Posting job with 1-second SLA...")
    result = await arc.post_job(
        worker=worker_acct.address,
        usdc_amount=0.05,
        timeout_seconds=1,   # 1 second — guaranteed to breach
    )
    job_id = result["job_id"]
    log(f"  ✓ Job #{job_id} created, TX: {tx_link(result['create_tx'])}")

    log("  Waiting 3 seconds for SLA to expire...")
    await asyncio.sleep(3)

    log("  Slashing job (SLA breached)...")
    slash_tx = await arc.slash_job(job_id)
    log(f"  ✓ Job #{job_id} slashed — USDC returned to employer")
    log(f"    TX: {tx_link(slash_tx)}")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "demo"

    if mode == "slash":
        asyncio.run(run_slash_demo())
    else:
        asyncio.run(run_demo())
