import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DriveFilePicker, { type DriveFilePayload } from '../components/DriveFilePicker'

const API      = import.meta.env.VITE_ARC_API_URL ?? 'http://localhost:8000'
const EXPLORER = 'https://testnet.arcscan.app'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubTask {
  agent_name:  string
  description: string
  status:      string
  job_id:      number | null
  create_tx:   string | null
  settle_tx:   string | null
  result:      string | null
}

interface TaskRecord {
  task_id:          string
  employer_address: string
  employer_name:    string
  description:      string
  budget_usdc:      number
  deadline_hours:   number
  status:           string
  result:           string | null
  subtasks:         SubTask[]
  created_at:       number
  completed_at:     number | null
  agent_name?:      string | null
  create_tx?:       string | null
  settle_tx?:       string | null
  receipt_id?:      string | null
}

interface AgentCard {
  agent_id:       string
  name:           string
  owner:          string
  payment_addr:   string
  capabilities:   string[]
  endpoint:       string
  registered_at:  number
  jobs_completed: number
  jobs_slashed:   number
  jobs_total:     number
  reputation:     number
  active:         boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    completed:   'bg-arc-green/10 text-arc-green border-arc-green/20',
    in_progress: 'bg-arc-amber/10 text-arc-amber border-arc-amber/20',
    refunded:    'bg-red-500/10 text-red-400 border-red-500/20',
    pending:     'border-arc-border text-arc-muted',
  }
  const label: Record<string, string> = {
    completed:   'Completed',
    in_progress: 'In Progress',
    refunded:    'Refunded',
    pending:     'Pending',
  }
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${cfg[status] ?? 'border-arc-border text-arc-muted'}`}>
      {label[status] ?? status}
    </span>
  )
}

function Countdown({ createdAt, deadlineHours }: { createdAt: number; deadlineHours: number }) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    const deadline = createdAt + deadlineHours * 3600
    const update = () => setRemaining(Math.max(0, deadline - Math.floor(Date.now() / 1000)))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [createdAt, deadlineHours])

  const h = Math.floor(remaining / 3600)
  const m = Math.floor((remaining % 3600) / 60)
  const s = remaining % 60
  const fmt = (n: number) => String(n).padStart(2, '0')

  return (
    <span className={`font-mono text-[11px] ${remaining < 3600 ? 'text-red-400' : 'text-arc-sub'}`}>
      {fmt(h)}:{fmt(m)}:{fmt(s)} remaining
    </span>
  )
}

function ReputationBar({ score }: { score: number }) {
  const pct = Math.min(100, score / 100)
  const color = pct >= 70 ? 'bg-arc-green' : pct >= 40 ? 'bg-arc-amber' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-arc-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] text-arc-muted w-12 text-right">
        {(score / 1000).toFixed(1)}/10
      </span>
    </div>
  )
}

// ── Gmail connect (UI stub — shows connected state) ───────────────────────────

function GmailConnect({ onChange }: { onChange: (connected: boolean) => void }) {
  const [connected, setConnected] = useState(() => localStorage.getItem('gmail_connected') === '1')

  const connect = () => {
    localStorage.setItem('gmail_connected', '1')
    setConnected(true)
    onChange(true)
  }
  const disconnect = () => {
    localStorage.removeItem('gmail_connected')
    setConnected(false)
    onChange(false)
  }

  useEffect(() => { onChange(connected) }, [])  // eslint-disable-line

  if (connected) {
    return (
      <div className="flex items-center justify-between border border-arc-border rounded-lg px-4 py-2.5 bg-arc-surface">
        <div className="flex items-center gap-2">
          <GmailIcon className="text-arc-green" />
          <span className="font-mono text-[11px] text-arc-green font-semibold">Gmail connected</span>
          <span className="font-mono text-[10px] text-arc-muted">(agents can read relevant threads)</span>
        </div>
        <button
          type="button"
          onClick={disconnect}
          className="font-mono text-[10px] text-arc-muted hover:text-white transition-colors"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={connect}
      className="flex items-center gap-2 border border-arc-border rounded-lg px-4 py-2.5 font-mono text-xs text-arc-sub hover:border-arc-green hover:text-white transition-colors w-fit"
    >
      <GmailIcon />
      Connect Gmail
    </button>
  )
}

// ── Slack connect (UI stub) ───────────────────────────────────────────────────

function SlackConnect({ onChange }: { onChange: (connected: boolean) => void }) {
  const [connected, setConnected] = useState(() => localStorage.getItem('slack_connected') === '1')

  const connect = () => {
    localStorage.setItem('slack_connected', '1')
    setConnected(true)
    onChange(true)
  }
  const disconnect = () => {
    localStorage.removeItem('slack_connected')
    setConnected(false)
    onChange(false)
  }

  useEffect(() => { onChange(connected) }, [])  // eslint-disable-line

  if (connected) {
    return (
      <div className="flex items-center justify-between border border-arc-border rounded-lg px-4 py-2.5 bg-arc-surface">
        <div className="flex items-center gap-2">
          <SlackIcon className="text-arc-green" />
          <span className="font-mono text-[11px] text-arc-green font-semibold">Slack connected</span>
          <span className="font-mono text-[10px] text-arc-muted">(agents can read channel context)</span>
        </div>
        <button
          type="button"
          onClick={disconnect}
          className="font-mono text-[10px] text-arc-muted hover:text-white transition-colors"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={connect}
      className="flex items-center gap-2 border border-arc-border rounded-lg px-4 py-2.5 font-mono text-xs text-arc-sub hover:border-arc-green hover:text-white transition-colors w-fit"
    >
      <SlackIcon />
      Connect Slack
    </button>
  )
}

// ── Tab 1: Marketplace ────────────────────────────────────────────────────────

const AGENT_META: Record<string, { specialty: string; pricePerTask: number; description: string }> = {
  ResearchBot: {
    specialty:    'Research & Analysis',
    pricePerTask: 0.033,
    description:  'Gathers facts, context, and background on any topic. Best for market research, competitive intelligence, and literature review.',
  },
  AnalystBot: {
    specialty:    'Data & Financial Analysis',
    pricePerTask: 0.033,
    description:  'Turns raw data into decisions. Runs comparisons, risk assessments, financial modelling, and trend analysis.',
  },
  WriterBot: {
    specialty:    'Content & Communication',
    pricePerTask: 0.034,
    description:  'Synthesizes outputs into clear, professional deliverables. Reports, summaries, client-ready content.',
  },
}

function MarketplaceTab({ onHire }: { onHire: (agentName: string) => void }) {
  const [agents, setAgents] = useState<AgentCard[]>([])
  const [loading, setLoad]  = useState(true)

  useEffect(() => {
    fetch(`${API}/api/agents`)
      .then(r => r.json())
      .then((d: AgentCard[]) => setAgents(d))
      .catch(() => null)
      .finally(() => setLoad(false))
  }, [])

  if (loading) return <div className="font-mono text-xs text-arc-muted mt-8">Loading agents…</div>

  if (agents.length === 0) return (
    <div className="border border-arc-border rounded-xl p-12 text-center">
      <div className="font-mono text-xs text-arc-muted">No agents registered — start the backend to load the registry.</div>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="font-mono text-[9px] text-arc-muted tracking-widest uppercase mb-1">AGENT MARKETPLACE</div>
        <p className="font-mono text-[12px] text-arc-sub">
          Hire specialized AI agents. Payment is locked in escrow before work begins — released only when it's done.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {agents.map(agent => {
          const meta = AGENT_META[agent.name] ?? {
            specialty:    agent.capabilities[0] ?? 'General',
            pricePerTask: 0.033,
            description:  `Specialized in: ${agent.capabilities.join(', ')}.`,
          }
          const addrShort = `${agent.payment_addr.slice(0, 6)}…${agent.payment_addr.slice(-4)}`

          return (
            <div key={agent.agent_id} className="border border-arc-border rounded-xl bg-arc-surface flex flex-col overflow-hidden hover:border-arc-green/40 transition-colors">

              {/* Card header */}
              <div className="px-5 pt-5 pb-4 flex flex-col gap-3 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm font-bold text-white">{agent.name}</div>
                    <div className="font-mono text-[11px] text-arc-green mt-0.5">{meta.specialty}</div>
                  </div>
                  <span className={`font-mono text-[9px] px-2 py-0.5 rounded border flex-shrink-0 ${
                    agent.active
                      ? 'text-arc-green border-arc-green/20 bg-arc-green/5'
                      : 'text-arc-muted border-arc-border'
                  }`}>
                    {agent.active ? '● Active' : '○ Offline'}
                  </span>
                </div>

                <p className="font-mono text-[11px] text-arc-sub leading-relaxed">{meta.description}</p>

                {/* Capabilities */}
                <div className="flex flex-wrap gap-1.5">
                  {agent.capabilities.slice(0, 4).map(cap => (
                    <span key={cap} className="font-mono text-[9px] text-arc-muted border border-arc-border/60 rounded px-1.5 py-0.5">{cap}</span>
                  ))}
                </div>

                {/* Stats */}
                <div className="flex flex-col gap-2 mt-auto pt-3 border-t border-arc-border">
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-arc-muted">Reputation</span>
                  </div>
                  <ReputationBar score={agent.reputation} />

                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div>
                      <div className="font-mono text-[9px] text-arc-muted uppercase tracking-wide">Jobs done</div>
                      <div className="font-mono text-sm font-bold text-white mt-0.5">{agent.jobs_completed}</div>
                    </div>
                    <div>
                      <div className="font-mono text-[9px] text-arc-muted uppercase tracking-wide">Price / task</div>
                      <div className="font-mono text-sm font-bold text-arc-amber mt-0.5">{meta.pricePerTask.toFixed(3)} USDC</div>
                    </div>
                  </div>

                  <div className="font-mono text-[9px] text-arc-muted mt-1">
                    Wallet: <span className="text-arc-sub">{addrShort}</span>
                  </div>
                </div>
              </div>

              {/* CTA */}
              <div className="border-t border-arc-border p-4">
                <button
                  onClick={() => onHire(agent.name)}
                  className="w-full bg-arc-green text-black font-mono font-semibold text-xs py-2.5 rounded-lg hover:bg-emerald-400 transition-colors"
                >
                  Hire {agent.name} →
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pipeline note */}
      <div className="border border-arc-border/50 rounded-xl p-5 bg-arc-surface/50 flex flex-col gap-2">
        <div className="font-mono text-[10px] text-arc-muted tracking-widest uppercase">HOW TASKS WORK</div>
        <p className="font-mono text-[12px] text-arc-sub leading-relaxed">
          When you post a task, a Planner breaks it into 3 sub-tasks and routes each to the best specialist agent.
          All three run in parallel. Each has its own escrow. The synthesizer combines all outputs into one final response.
          You pay only if all three deliver.
        </p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {['Planner', '→ ResearchBot', '→ AnalystBot', '→ WriterBot', '→ Synthesizer', '→ You'].map(s => (
            <span key={s} className="font-mono text-[10px] text-arc-sub border border-arc-border rounded px-2 py-1">{s}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Tab 2: Post a Task ────────────────────────────────────────────────────────

function PostTaskTab({ preselectedAgent, onTaskPosted }: { preselectedAgent?: string; onTaskPosted: () => void }) {
  const [desc, setDesc]             = useState('')
  const [budget, setBudget]         = useState('0.10')
  const [deadline, setDeadline]     = useState('24')
  const [submitting, setSub]        = useState(false)
  const [result, setResult]         = useState<TaskRecord | null>(null)
  const [error, setError]           = useState('')
  const [driveFiles, setDriveFiles] = useState<DriveFilePayload[]>([])
  const [, setGmailConnected]       = useState(false)
  const [, setSlackConnected]       = useState(false)

  const employerAddress = localStorage.getItem('brewing_employer_address') || ''
  const employerName    = localStorage.getItem('brewing_employer_name') || ''

  // If a specific agent was hired from marketplace, note it in the description placeholder
  const placeholder = preselectedAgent
    ? `Describe your task for ${preselectedAgent}…`
    : 'e.g. Research the top 5 competitors in the DeFi lending space and summarise their key differentiators…'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!desc.trim() || submitting) return
    setSub(true); setError(''); setResult(null)

    try {
      const res = await fetch(`${API}/api/tasks`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          description:      desc.trim(),
          budget_usdc:      parseFloat(budget) || 0.10,
          deadline_hours:   parseInt(deadline) || 24,
          employer_address: employerAddress,
          employer_name:    employerName,
          drive_files:      driveFiles,
        }),
        signal: AbortSignal.timeout(180_000),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail ?? 'Request failed')
      }
      const data: TaskRecord = await res.json()
      setResult(data)
      setDesc('')
      onTaskPosted()
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Something went wrong')
    } finally {
      setSub(false)
    }
  }

  const lockedUsdc = (parseFloat(budget) || 0.10).toFixed(3)

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <div className="font-mono text-[9px] text-arc-muted tracking-widest uppercase mb-1">POST A TASK</div>
        <p className="font-mono text-[12px] text-arc-sub">
          {preselectedAgent
            ? `Hiring ${preselectedAgent}. Brewing will route your task through the full 3-agent pipeline and deliver a synthesized result.`
            : 'Describe what you need. Brewing selects the best agents, locks USDC in escrow, and releases payment only when the work is done.'
          }
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5">
        {/* Task description */}
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[10px] text-arc-muted tracking-widest uppercase">Task Description</label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder={placeholder}
            rows={5}
            required
            className="bg-arc-surface border border-arc-border rounded-lg px-4 py-3 font-mono text-sm text-white placeholder-arc-muted focus:outline-none focus:border-arc-green transition-colors resize-none"
          />
        </div>

        {/* Integrations */}
        <div className="flex flex-col gap-3">
          <label className="font-mono text-[10px] text-arc-muted tracking-widest uppercase">
            Data Sources <span className="text-arc-muted normal-case tracking-normal">(optional — agents will read from connected sources)</span>
          </label>

          {/* Google Drive */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] text-arc-muted">Google Drive</span>
            <DriveFilePicker onFilesChange={setDriveFiles} />
          </div>

          {/* Gmail */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] text-arc-muted">Gmail</span>
            <GmailConnect onChange={setGmailConnected} />
          </div>

          {/* Slack */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] text-arc-muted">Slack</span>
            <SlackConnect onChange={setSlackConnected} />
          </div>
        </div>

        {/* Budget + Deadline */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[10px] text-arc-muted tracking-widest uppercase">Budget (USDC)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              className="bg-arc-surface border border-arc-border rounded-lg px-4 py-3 font-mono text-sm text-white focus:outline-none focus:border-arc-green transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[10px] text-arc-muted tracking-widest uppercase">Deadline</label>
            <select
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="bg-arc-surface border border-arc-border rounded-lg px-4 py-3 font-mono text-sm text-white focus:outline-none focus:border-arc-green transition-colors"
            >
              <option value="1">1 hour</option>
              <option value="6">6 hours</option>
              <option value="24">24 hours</option>
              <option value="72">3 days</option>
            </select>
          </div>
        </div>

        {/* Escrow preview */}
        <div className="border border-arc-border/50 rounded-lg px-4 py-3 bg-arc-surface/50 flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] text-arc-muted">Escrow to lock</span>
            <span className="font-mono text-lg font-bold text-arc-amber">{lockedUsdc} USDC</span>
          </div>
          <div className="font-mono text-[10px] text-arc-muted text-right">
            <div>Split across 3 agents</div>
            <div className="text-arc-green">Released only on delivery</div>
          </div>
        </div>

        {error && (
          <div className="border border-red-500/20 rounded-lg px-4 py-3 bg-red-500/5">
            <span className="font-mono text-xs text-red-400">{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !desc.trim()}
          className={`font-mono font-semibold text-sm px-6 py-3 rounded-lg transition-all ${
            submitting || !desc.trim()
              ? 'bg-arc-surface border border-arc-border text-arc-muted cursor-not-allowed'
              : 'bg-arc-green text-black hover:bg-emerald-400'
          }`}
        >
          {submitting ? '⟳ Agents working… this takes ~30s' : `▶ Post Task · Lock ${lockedUsdc} USDC`}
        </button>
        {submitting && (
          <p className="font-mono text-[10px] text-arc-muted">
            Planner → ResearchBot (escrow) → AnalystBot (escrow) → WriterBot (escrow) → Synthesizer → Done
          </p>
        )}
      </form>

      {/* Result */}
      {result && result.status === 'completed' && (
        <div className="flex flex-col gap-4">
          <div className="border border-arc-green/20 rounded-xl bg-arc-green/5 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-arc-green text-sm">✓</span>
                <span className="font-mono text-xs font-semibold text-arc-green">
                  3-agent pipeline complete · {result.budget_usdc.toFixed(3)} USDC settled
                </span>
              </div>
              <StatusBadge status={result.status} />
            </div>
            <div className="font-mono text-[11px] text-white leading-relaxed bg-black/40 rounded-lg p-4 border border-arc-border">
              {result.result}
            </div>
          </div>
          {result.subtasks.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="font-mono text-[9px] text-arc-muted tracking-widest uppercase">AGENT BREAKDOWN</div>
              {result.subtasks.map(st => (
                <div key={st.agent_name} className="border border-arc-border rounded-lg bg-arc-surface p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-semibold text-white">{st.agent_name}</span>
                    <div className="flex items-center gap-3 font-mono text-[10px]">
                      {st.create_tx && <a href={`${EXPLORER}/tx/${st.create_tx}`} target="_blank" rel="noreferrer" className="text-arc-green hover:underline">Escrow ↗</a>}
                      {st.settle_tx && <a href={`${EXPLORER}/tx/${st.settle_tx}`} target="_blank" rel="noreferrer" className="text-arc-green hover:underline">Settlement ↗</a>}
                    </div>
                  </div>
                  <p className="font-mono text-[10px] text-arc-sub leading-relaxed">{st.result}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab 3: Active Jobs ────────────────────────────────────────────────────────

function ActiveJobsTab() {
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [loading, setLoad] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await fetch(`${API}/api/tasks`).then(r => r.json())
      setTasks(data as TaskRecord[])
    } catch { /* offline */ } finally { setLoad(false) }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  if (loading) return <div className="font-mono text-xs text-arc-muted mt-8">Loading jobs…</div>

  if (tasks.length === 0) return (
    <div className="border border-arc-border rounded-xl p-12 text-center">
      <div className="font-mono text-xs text-arc-muted">No tasks yet — post your first task</div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="font-mono text-[9px] text-arc-muted tracking-widest uppercase">
        {tasks.length} TASK{tasks.length !== 1 ? 'S' : ''} TOTAL
      </div>
      {tasks.map(task => (
        <div key={task.task_id} className="border border-arc-border rounded-xl bg-arc-surface overflow-hidden hover:border-arc-green/30 transition-colors">
          {/* Header */}
          <div className="border-b border-arc-border px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-mono text-[10px] text-arc-muted flex-shrink-0">#{task.task_id}</span>
              {task.subtasks.length > 0 && (
                <span className="font-mono text-[10px] text-arc-sub">
                  {task.subtasks.map(s => s.agent_name).join(' · ')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="font-mono text-[11px] text-arc-amber font-bold">{task.budget_usdc.toFixed(3)} USDC</span>
              <StatusBadge status={task.status} />
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-4 flex flex-col gap-3">
            <p className="font-mono text-[12px] text-white leading-relaxed">{task.description}</p>

            <div className="flex flex-wrap gap-4 font-mono text-[10px] text-arc-muted">
              {task.status === 'in_progress' && (
                <Countdown createdAt={task.created_at} deadlineHours={task.deadline_hours} />
              )}
              {task.completed_at && (
                <span>Completed {new Date(task.completed_at * 1000).toLocaleTimeString()}</span>
              )}
            </div>

            {/* Sub-tasks pipeline */}
            {task.subtasks.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                <div className="font-mono text-[9px] text-arc-muted tracking-widest uppercase">AGENT PIPELINE</div>
                {task.subtasks.map(st => (
                  <div key={st.agent_name} className="border border-arc-border rounded-lg bg-black/40 p-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-[10px] ${
                          st.status === 'completed' ? 'text-arc-green' :
                          st.status === 'working'   ? 'text-arc-amber' : 'text-arc-muted'
                        }`}>
                          {st.status === 'completed' ? '✓' : st.status === 'working' ? '⟳' : '○'}
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-white">{st.agent_name}</span>
                        <StatusBadge status={st.status} />
                      </div>
                      <div className="flex gap-3 font-mono text-[10px]">
                        {st.create_tx && (
                          <a href={`${EXPLORER}/tx/${st.create_tx}`} target="_blank" rel="noreferrer" className="text-arc-green hover:underline">
                            Escrow ↗
                          </a>
                        )}
                        {st.settle_tx && (
                          <a href={`${EXPLORER}/tx/${st.settle_tx}`} target="_blank" rel="noreferrer" className="text-arc-green hover:underline">
                            Settlement ↗
                          </a>
                        )}
                      </div>
                    </div>
                    {st.result && (
                      <p className="font-mono text-[10px] text-arc-sub leading-relaxed">{st.result}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Final result */}
            {task.result && (
              <div className="border border-arc-green/20 rounded-lg p-4 bg-arc-green/5 mt-1">
                <div className="font-mono text-[9px] text-arc-green tracking-widest uppercase mb-2">COMBINED RESULT</div>
                <p className="font-mono text-[11px] text-white leading-relaxed">{task.result}</p>
              </div>
            )}

            {/* Refunded state */}
            {task.status === 'refunded' && (
              <div className="border border-red-500/20 rounded-lg p-4 bg-red-500/5">
                <div className="font-mono text-[9px] text-red-400 tracking-widest uppercase mb-1">SLASHED — REFUNDED</div>
                <p className="font-mono text-[11px] text-arc-sub">Agent missed SLA deadline. {task.budget_usdc.toFixed(3)} USDC returned to employer.</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tab 4: Receipts ───────────────────────────────────────────────────────────

function ReceiptsTab() {
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [loading, setLoad] = useState(true)

  useEffect(() => {
    fetch(`${API}/api/tasks`)
      .then(r => r.json())
      .then((d: TaskRecord[]) => setTasks(d.filter(t => t.status === 'completed')))
      .catch(() => null)
      .finally(() => setLoad(false))
  }, [])

  const download = (task: TaskRecord) => {
    const content = [
      `BREWING TASK RECEIPT`,
      `═══════════════════════════════`,
      `Task ID:      ${task.task_id}`,
      `Agents:       ${task.subtasks.length > 0 ? task.subtasks.map(s => s.agent_name).join(', ') : '—'}`,
      `Description:  ${task.description}`,
      `USDC Paid:    ${task.budget_usdc.toFixed(3)}`,
      `Completed:    ${task.completed_at ? new Date(task.completed_at * 1000).toISOString() : '—'}`,
      ``,
      `ON-CHAIN PROOF`,
      `──────────────`,
      ...task.subtasks.map(st =>
        `${st.agent_name}:\n  escrow=${st.create_tx ? `${EXPLORER}/tx/${st.create_tx}` : '—'}\n  settle=${st.settle_tx ? `${EXPLORER}/tx/${st.settle_tx}` : '—'}`
      ),
      ``,
      `RESULT`,
      `───────`,
      task.result ?? '—',
    ].join('\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `brewing-receipt-${task.task_id}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="font-mono text-xs text-arc-muted mt-8">Loading receipts…</div>

  if (tasks.length === 0) return (
    <div className="border border-arc-border rounded-xl p-12 text-center">
      <div className="font-mono text-xs text-arc-muted">No completed tasks yet</div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4 flex-col">
        <div className="font-mono text-[9px] text-arc-muted tracking-widest uppercase">
          {tasks.length} COMPLETED TASK{tasks.length !== 1 ? 'S' : ''}
        </div>
        <p className="font-mono text-[12px] text-arc-sub">
          Every completed job has a signed on-chain receipt. Downloadable proof of what was done, when, by whom, for how much.
        </p>
      </div>
      {tasks.map(task => (
        <div key={task.task_id} className="border border-arc-border rounded-xl bg-arc-surface overflow-hidden">
          <div className="border-b border-arc-border px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-arc-green text-xs">✓</span>
              <span className="font-mono text-[11px] text-white">
                {task.subtasks.length > 0 ? task.subtasks.map(s => s.agent_name).join(' · ') : 'Agent'}
              </span>
              <span className="font-mono text-[10px] text-arc-muted">#{task.task_id}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-arc-amber font-bold">{task.budget_usdc.toFixed(3)} USDC</span>
              <button
                onClick={() => download(task)}
                className="font-mono text-[10px] text-arc-sub border border-arc-border rounded px-2 py-1 hover:border-arc-green hover:text-arc-green transition-colors"
              >
                ↓ Download Receipt
              </button>
            </div>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            <p className="font-mono text-[11px] text-arc-sub">{task.description}</p>
            <div className="flex flex-wrap gap-4 font-mono text-[10px] text-arc-muted">
              {task.completed_at && <span>{new Date(task.completed_at * 1000).toLocaleString()}</span>}
              <span>{task.subtasks.filter(s => s.status === 'completed').length}/{task.subtasks.length} agents settled on-chain</span>
              {task.subtasks.find(s => s.settle_tx) && (
                <a
                  href={`${EXPLORER}/tx/${task.subtasks.find(s => s.settle_tx)!.settle_tx!}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-arc-green hover:underline"
                >
                  View on ArcScan ↗
                </a>
              )}
            </div>
            {task.result && (
              <div className="border border-arc-border rounded-lg p-4 bg-black/40">
                <p className="font-mono text-[11px] text-white leading-relaxed">{task.result}</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Dashboard shell ───────────────────────────────────────────────────────────

type TabId = 'marketplace' | 'post' | 'jobs' | 'receipts'

export default function Dashboard() {
  const navigate  = useNavigate()
  const [tab, setTab]             = useState<TabId>('marketplace')
  const [refreshKey, setRefreshKey] = useState(0)
  const [preselectedAgent, setPreselectedAgent] = useState<string | undefined>()

  const employerName = localStorage.getItem('brewing_employer_name') || ''

  const handleHire = (agentName: string) => {
    setPreselectedAgent(agentName)
    setTab('post')
  }

  const TABS: { id: TabId; label: string; sub: string }[] = [
    { id: 'marketplace', label: 'Agents',      sub: 'Browse · hire · compare' },
    { id: 'post',        label: 'Post a Task', sub: 'New task · escrow · settle' },
    { id: 'jobs',        label: 'Active Jobs', sub: 'Status · results · timers' },
    { id: 'receipts',    label: 'Receipts',    sub: 'History · proof · download' },
  ]

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      {/* Nav */}
      <nav className="border-b border-arc-border sticky top-0 z-50 bg-black/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="font-mono font-bold text-sm tracking-[0.2em] hover:text-arc-green transition-colors"
            >
              BREWING
            </button>
            <span className="text-arc-border">/</span>
            <span className="font-mono text-xs text-arc-sub">
              {employerName ? `${employerName}` : 'Dashboard'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-arc-green pulse-dot" />
              <span className="font-mono text-[11px] text-arc-green tracking-wide">Arc Testnet Live</span>
            </div>
            <button
              onClick={() => navigate('/onboard')}
              className="font-mono text-[10px] text-arc-sub border border-arc-border rounded px-3 py-1.5 hover:border-arc-green hover:text-arc-green transition-colors"
            >
              + New Account
            </button>
          </div>
        </div>
      </nav>

      {/* Tab bar */}
      <div className="border-b border-arc-border bg-arc-surface">
        <div className="max-w-6xl mx-auto px-6 flex overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-6 py-4 flex flex-col gap-0.5 border-b-2 transition-all flex-shrink-0 ${
                tab === t.id
                  ? 'border-arc-green text-white'
                  : 'border-transparent text-arc-muted hover:text-arc-sub'
              }`}
            >
              <span className="font-mono text-xs font-semibold tracking-wide">{t.label}</span>
              <span className="font-mono text-[9px] text-arc-muted">{t.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {tab === 'marketplace' && <MarketplaceTab onHire={handleHire} />}
        {tab === 'post'        && (
          <PostTaskTab
            preselectedAgent={preselectedAgent}
            onTaskPosted={() => { setRefreshKey(k => k + 1); setTab('jobs') }}
          />
        )}
        {tab === 'jobs'        && <ActiveJobsTab key={refreshKey} />}
        {tab === 'receipts'    && <ReceiptsTab />}
      </main>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function GmailIcon({ className = 'text-arc-sub' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
    </svg>
  )
}

function SlackIcon({ className = 'text-arc-sub' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
    </svg>
  )
}
