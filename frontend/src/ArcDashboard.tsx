/**
 * ArcDashboard — Brewing on Arc L1 (Circle stablecoin chain)
 * Reads live data from FastAPI backend at /api (proxied) or VITE_ARC_API_URL
 * No wallet adapter needed — USDC is the native Arc gas token.
 */
import { useState, useEffect, useCallback } from 'react';

const A    = '#F59E0B';
const A12  = 'rgba(245,158,11,0.12)';
const A30  = 'rgba(245,158,11,0.30)';
const G    = '#10B981';
const R    = '#EF4444';
const API  = import.meta.env.VITE_ARC_API_URL ?? 'http://localhost:8000';
const EXPLORER = 'https://testnet.arcscan.app';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Analytics {
  program: string;
  network: string;
  metrics: {
    totalJobs:        number;
    completedJobs:    number;
    slashedJobs:      number;
    completionRate:   number;
    usdcSettled:      number;
    usdcSlashed:      number;
    registeredAgents: number;
    receiptsIssued:   number;
  };
}

interface Job {
  job_id:         number;
  employer:       string;
  worker:         string;
  amount_usdc:    number;
  sla_timeout:    number;
  status:         string;
  ipfs_spec_hash: string;
}

interface Agent {
  agent_id:       string;
  name:           string;
  payment_addr:   string;
  capabilities:   string[];
  reputation:     number;
  jobs_completed: number;
  jobs_slashed:   number;
  jobs_total:     number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const short = (s: string) => s?.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
const statusColor = (s: string) => s === 'Completed' ? G : s === 'Slashed' ? R : A;

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#111', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10, padding: '18px 22px', ...style,
    }}>
      {children}
    </div>
  );
}

function Metric({ label, value, sub, color = '#fff' }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: '#333', marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

function Label({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 10, color: '#333', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>
      {text}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ArcDashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [jobs, setJobs]           = useState<Job[]>([]);
  const [agents, setAgents]       = useState<Agent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [lastPoll, setLastPoll]   = useState<Date | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentLog, setAgentLog]   = useState<string[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const [aRes, jRes, agRes] = await Promise.all([
        fetch(`${API}/api/analytics`),
        fetch(`${API}/api/jobs`),
        fetch(`${API}/api/agents`),
      ]);
      if (!aRes.ok) throw new Error('API unreachable — is uvicorn running on :8000?');
      const [a, j, ag] = await Promise.all([aRes.json(), jRes.json(), agRes.json()]);
      setAnalytics(a);
      setJobs((j as Job[]).sort((a, b) => b.job_id - a.job_id));
      setAgents(ag as Agent[]);
      setLastPoll(new Date());
      setError('');
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 5000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const runDemo = async () => {
    setAgentRunning(true);
    setAgentLog(['Starting agent loop…']);
    try {
      const res = await fetch(`${API}/api/demo/run`, { method: 'POST' });
      const data = await res.json();
      setAgentLog(data.log ?? ['Done.']);
      await fetchAll();
    } catch (e: unknown) {
      setAgentLog([`Error: ${(e as Error).message}`]);
    } finally {
      setAgentRunning(false);
    }
  };

  const m = analytics?.metrics;

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', color: '#ccc',
      fontFamily: "'SF Mono', 'Fira Code', monospace",
      padding: '32px 28px', maxWidth: 1100, margin: '0 auto',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
        <span style={{ color: A, fontSize: 13, letterSpacing: '0.18em', fontWeight: 700 }}>BREWING</span>
        <span style={{ color: '#333', fontSize: 11 }}>Arc L1 — Agent Settlement Protocol</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#2a2a2a' }}>
          {lastPoll ? `↻ ${lastPoll.toLocaleTimeString()}` : 'connecting…'}
        </span>
      </div>
      <div style={{ fontSize: 10, color: '#2a2a2a', marginBottom: 32 }}>
        {analytics?.program
          ? <a href={`${EXPLORER}/address/${analytics.program}`} target="_blank" rel="noreferrer"
               style={{ color: '#333', textDecoration: 'none' }}>{analytics.program}</a>
          : '…'
        }
        {' '}· Arc Testnet · chain 5042002 · native USDC
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 11, color: R,
        }}>
          {error}
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <Metric label="Total Jobs"      value={loading ? '…' : (m?.totalJobs ?? 0)} />
        <Metric label="Completed"       value={loading ? '…' : (m?.completedJobs ?? 0)} color={G} />
        <Metric label="Slashed"         value={loading ? '…' : (m?.slashedJobs ?? 0)} color={R} />
        <Metric label="USDC Settled"    value={loading ? '…' : `$${(m?.usdcSettled ?? 0).toFixed(2)}`} color={A} sub="native Arc gas token" />
        <Metric label="Agents"          value={loading ? '…' : (m?.registeredAgents ?? 0)} sub="Circle MPC wallets" />
        <Metric label="Receipts"        value={loading ? '…' : (m?.receiptsIssued ?? 0)} sub="signed on-chain" />
      </div>

      {/* Run demo */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={runDemo} disabled={agentRunning}
          style={{
            padding: '8px 20px', background: agentRunning ? 'transparent' : A12,
            border: `1px solid ${agentRunning ? '#222' : A30}`,
            borderRadius: 6, color: agentRunning ? '#333' : A,
            fontFamily: 'inherit', fontSize: 12, cursor: agentRunning ? 'not-allowed' : 'pointer',
          }}
        >
          {agentRunning ? '⟳ running…' : '▶ run agent demo'}
        </button>
        <span style={{ fontSize: 11, color: '#333' }}>
          ACP discovery → escrow → Claude → USDC settlement → signed receipt
        </span>
      </div>

      {/* Agent log */}
      {agentLog.length > 0 && (
        <Card style={{ marginBottom: 20, background: '#0d0d0d' }}>
          <Label text="Agent Output" />
          {agentLog.map((line, i) => (
            <div key={i} style={{ fontSize: 11, color: '#555', lineHeight: 1.8 }}>
              <span style={{ color: '#2a2a2a', marginRight: 10 }}>{String(i + 1).padStart(2, '0')}</span>
              {line}
            </div>
          ))}
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

        {/* Agent registry */}
        <Card>
          <Label text="Agent Registry — Pillar A" />
          {agents.length === 0
            ? <div style={{ color: '#2a2a2a', fontSize: 12 }}>no agents — start the backend</div>
            : agents.map(a => (
              <div key={a.agent_id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: '1px solid #0f0f0f',
              }}>
                <div>
                  <div style={{ fontSize: 12, color: '#ccc' }}>{a.name}</div>
                  <div style={{ fontSize: 10, color: '#333', marginTop: 2 }}>
                    {a.capabilities.slice(0, 3).join(' · ')}
                  </div>
                  <div style={{ fontSize: 10, color: '#2a2a2a', marginTop: 2 }}>
                    {short(a.payment_addr)} · Circle MPC
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, color: A, fontVariantNumeric: 'tabular-nums' }}>
                    {a.reputation.toFixed(0)} <span style={{ fontSize: 9, color: '#333' }}>bps</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#333', marginTop: 2 }}>
                    {a.jobs_completed}✓ {a.jobs_slashed}✗
                  </div>
                </div>
              </div>
            ))
          }
        </Card>

        {/* Recent jobs */}
        <Card>
          <Label text="On-Chain Jobs — Pillar B" />
          {jobs.length === 0
            ? <div style={{ color: '#2a2a2a', fontSize: 12 }}>no jobs yet</div>
            : jobs.slice(0, 6).map(job => (
              <div key={job.job_id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 0', borderBottom: '1px solid #0f0f0f',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#333', fontSize: 11 }}>#{job.job_id}</span>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: statusColor(job.status),
                    boxShadow: `0 0 5px ${statusColor(job.status)}`,
                    display: 'inline-block',
                  }} />
                  <span style={{ fontSize: 11, color: statusColor(job.status) }}>{job.status}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: A }}>${job.amount_usdc.toFixed(2)}</div>
                  {job.ipfs_spec_hash && job.ipfs_spec_hash !== '0'.repeat(64) && (
                    <div style={{ fontSize: 9, color: '#2a2a2a', marginTop: 2 }}>
                      {job.ipfs_spec_hash.slice(0, 12)}…
                    </div>
                  )}
                </div>
              </div>
            ))
          }
        </Card>
      </div>

      {/* Footer */}
      <div style={{ fontSize: 10, color: '#1f1f1f', display: 'flex', gap: 20, marginTop: 24 }}>
        <span>Brewing · Canteen Agora Hackathon 2026</span>
        <a href={`${EXPLORER}/address/${analytics?.program ?? ''}`} target="_blank" rel="noreferrer"
           style={{ color: '#1f1f1f', textDecoration: 'none' }}>Arc Explorer ↗</a>
        <a href="https://github.com/Lideeyah/brewing-agora-agents" target="_blank" rel="noreferrer"
           style={{ color: '#1f1f1f', textDecoration: 'none' }}>GitHub ↗</a>
      </div>
    </div>
  );
}
