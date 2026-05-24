# Brewing — B2B Agent Settlement on Arc L1

**Autonomous AI agents that hire each other, pay each other, and slash each other — all settled in USDC on Circle's Arc chain.**

> Canteen Agora Agents Hackathon · May 2026

---

## What It Does

An employer agent posts a job and locks USDC in an on-chain escrow. A worker agent (Claude) picks up the task, completes it autonomously, and gets paid the moment the employer approves. If the worker ghosts past the SLA deadline, the escrow slashes and refunds the employer automatically — no human required.

This is a trustless B2B economy for AI agents: no reputation system needed, no prior relationship, no manual payment rails. The smart contract handles the entire lifecycle.

```
Employer Agent                  AgentEscrow.vy              Worker Agent (Claude)
     │                               │                               │
     │── create_job(USDC) ──────────▶│                               │
     │   (USDC locks in escrow)      │                               │
     │                               │◀── task assigned ─────────────│
     │                               │                               │── run Claude ──▶
     │                               │                               │◀── AI output ───
     │◀── work submitted ────────────│                               │
     │── complete_job() ────────────▶│                               │
     │                               │── send(USDC) ────────────────▶│
     │                               │   (worker paid in ~400ms)     │
```

**Or if the SLA expires:**

```
     │── slash_job() ─────────────────────────────────────────────▶│
     │◀── send(USDC refund) ──────────────────────────────────────│
```

---

## Live Demo — Verified On-Chain

**Contract:** [`0x584164ce429991C30B5c83D5774d0870A77F5A22`](https://testnet.arcscan.app/address/0x584164ce429991C30B5c83D5774d0870A77F5A22)  
**Deploy TX:** [`549d8e52...`](https://testnet.arcscan.app/tx/0x549d8e52bdfa3ec203f275c9969663ee72690a0cab1a1c8dd8bb560fecbcbd85)  
**Network:** Arc Testnet · Chain ID 5042002 · Native USDC

| Job | Task Type | USDC | Status | TX |
|-----|-----------|------|--------|----|
| #7 | research | $0.10 | ✅ Completed | [view](https://testnet.arcscan.app/tx/0xc910eb0b683e7abf1536d40df95c4b05fad3fef5204b0ce618f8b786c6ee85ba) |
| #8 | analysis | $0.10 | ✅ Completed | [view](https://testnet.arcscan.app/tx/0x0436aae001d64011614ab8d7670bc7616e41a5e4cf55fa6e01aeee462baae60d) |
| #9 | strategy | $0.10 | ✅ Completed | [view](https://testnet.arcscan.app/tx/0xbedd40dcf8f111aa07bf8bdfa636609e11a84b78c7bf008d41e1a306ca553314) |
| #10 | adversarial | $0.05 | 🔴 Slashed | [view](https://testnet.arcscan.app/tx/0x328f71732680742d7b7585a848466284b52f95b3356a48a15eab3e18adc3ec6b) |

**10 total jobs · $0.60 USDC settled · $0.35 USDC slashed · all verifiable on Arc Explorer**

---

## Why Arc

Arc L1 is Circle's EVM chain where **USDC is the native gas token** — no wrapping, no bridging, no approval transactions. An AI agent can receive and spend USDC the same way Ethereum handles ETH. This makes micropayment-per-task economics viable: a $0.10 job costs ~$0.01 in fees with sub-second finality.

On any other chain, paying agents in USDC requires ERC20 `approve` + `transferFrom` — two transactions, price volatility risk, and gas denominated in a volatile asset. On Arc, it's a single `msg.value` call.

---

## Architecture

```
contracts/
  AgentEscrow.vy        Vyper 0.4.0 — native USDC escrow (msg.value / send())

backend/
  brewing_sdk.py        Async Arc RPC client — post_job, complete_job, slash_job
  agent.py              Autonomous Claude agent loop (poster + worker)
  main.py               FastAPI server — REST API for the React dashboard

tests/
  test_escrow.py        22 titanoboa tests — all passing in 0.38s

app/src/components/
  ArcDashboard.tsx      React dashboard — live job feed, analytics, demo trigger
```

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Arc testnet RPC URL (get one: `arc-canteen login && arc-canteen rpc-url`)

### 1. Clone & install

```bash
git clone <repo>
cd arc

python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in:
#   ARC_RPC_URL          — from arc-canteen rpc-url
#   ARC_PRIVATE_KEY      — funded Arc testnet wallet
#   ESCROW_CONTRACT_ADDRESS — deploy below, or use live: 0x584164ce429991C30B5c83D5774d0870A77F5A22
#   ANTHROPIC_API_KEY    — from console.anthropic.com
```

### 3. Run tests (all 22 pass in under 1 second)

```bash
pytest tests/ -v
```

### 4. Deploy contract (or use the live one)

```bash
DEPLOYER_KEY=0x... python3 deploy.py
```

### 5. Run the agent demo

```bash
# Full demo: 3 jobs, Claude completes tasks, USDC settles on-chain
python3 -m backend.agent

# Adversarial demo: 1-second SLA, SLA breaches, employer refunded
python3 -m backend.agent slash
```

### 6. Start the API + dashboard

```bash
# Terminal 1 — FastAPI backend
uvicorn backend.main:app --reload --port 8000

# Terminal 2 — React dashboard
cd ../app && npm install && npm run dev
# Open http://localhost:5173/arc
```

---

## Smart Contract

`contracts/AgentEscrow.vy` — 147 lines, Vyper 0.4.0

```vyper
@payable
@external
def create_job(_worker: address, _timeout: uint256, _ipfs_hash: bytes32) -> uint256:
    """Employer locks USDC via msg.value. Returns job_id."""
    assert msg.value >= MIN_AMOUNT   # 0.001 USDC minimum
    assert _worker != msg.sender     # no self-dealing
    assert _timeout > 0
    self.job_count += 1
    self.jobs[self.job_count] = Job(
        employer=msg.sender, worker=_worker,
        amount=msg.value,
        sla_timeout=block.timestamp + _timeout,
        status=1,  # Funded
        ipfs_spec_hash=_ipfs_hash,
    )
    return self.job_count

@external
def complete_job(_job_id: uint256):
    """Employer approves → USDC sent to worker. State-before-transfer (reentrancy safe)."""
    job: Job = self.jobs[_job_id]
    assert job.status == 1
    assert msg.sender == job.employer or msg.sender == self.owner
    self.jobs[_job_id].status = 2   # update first
    send(job.worker, job.amount)    # then transfer

@external
def slash_job(_job_id: uint256):
    """SLA expired → USDC returned to employer. Owner can force-slash anytime."""
    job: Job = self.jobs[_job_id]
    assert job.status == 1
    assert block.timestamp > job.sla_timeout or msg.sender == self.owner
    self.jobs[_job_id].status = 3
    send(job.employer, job.amount)
```

### Security properties
- State always updated before `send()` — no reentrancy vector
- Only employer or contract owner can settle
- SLA slash only available after timeout, or owner override
- Zero ERC20 surface area — no approve/allowance to exploit

---

## Test Coverage

```
tests/test_escrow.py — 22 tests, 0.38s

  Deployment:       owner set on deploy ✓, job_count starts at zero ✓
  create_job:       locks USDC ✓, increments counter ✓, status=Funded ✓,
                    records parties ✓, rejects below minimum ✓,
                    rejects self-as-worker ✓, rejects zero timeout ✓
  complete_job:     pays worker ✓, status=Completed ✓, owner can release ✓,
                    stranger cannot ✓, double-settle fails ✓
  slash_job:        refunds employer after timeout ✓, status=Slashed ✓,
                    reverts before timeout ✓, owner can force-slash ✓
  is_slashable:     false before timeout ✓, true after ✓
  transfer_ownership: round-trip ✓, non-owner blocked ✓
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ARC_RPC_URL` | Arc testnet RPC endpoint |
| `ARC_PRIVATE_KEY` | Employer wallet private key (fund via faucet.circle.com) |
| `ESCROW_CONTRACT_ADDRESS` | Deployed AgentEscrow.vy |
| `ANTHROPIC_API_KEY` | For Claude worker agent |
| `USDC_ADDRESS` | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` (Arc testnet) |

```bash
# Get Arc testnet funds
# 1. Install CLI: uv tool install git+https://github.com/the-canteen-dev/ARC-cli.git
# 2. arc-canteen login
# 3. Visit faucet.circle.com → Arc Testnet → receive 20 USDC
```

---

## Built With

| Layer | Tech |
|-------|------|
| Smart Contract | Vyper 0.4.0 on Arc Testnet (EVM, chain 5042002) |
| Contract Tests | titanoboa 0.2.8 — in-process EVM, no devnet needed |
| Backend | FastAPI + web3.py — async Arc RPC client |
| AI Agents | Claude claude-opus-4-5 via Anthropic SDK |
| Frontend | React + Vite + Tailwind — dark terminal aesthetic |
| Settlement | Native USDC (msg.value) — no ERC20 approve needed |

---

*Brewing — trustless USDC settlement for AI agent economies.*  
*Canteen Agora Agents Hackathon · May 2026*
