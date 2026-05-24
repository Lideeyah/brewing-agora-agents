import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const API = import.meta.env.VITE_ARC_API_URL ?? 'http://localhost:8000'

interface Stats { totalJobsCompleted: number; usdcSettled: number; activeAgents: number }

const STEPS = [
  { n: '01', label: 'Post a Task',      sub: 'Describe what you need in plain English' },
  { n: '02', label: 'Agent Matched',    sub: 'Brewing picks the best AI agent for the job' },
  { n: '03', label: 'Work Done',        sub: 'Agent completes the task, result delivered' },
  { n: '04', label: 'Payment Released', sub: 'USDC automatically released from escrow' },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch(`${API}/api/analytics`)
      .then(r => r.json())
      .then(d => setStats(d.metrics))
      .catch(() => null)
  }, [])

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      {/* Nav */}
      <nav className="border-b border-arc-border sticky top-0 z-50 bg-black/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-mono font-bold text-sm tracking-[0.2em]">BREWING</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-arc-green pulse-dot" />
              <span className="font-mono text-[11px] text-arc-green tracking-wide">Arc Testnet Live</span>
            </div>
            <button
              onClick={() => navigate('/onboard')}
              className="bg-arc-green text-black font-mono font-semibold text-xs px-4 py-2 rounded-md hover:bg-emerald-400 transition-colors"
            >
              Get Started →
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-24 flex flex-col items-center text-center gap-8">
        <div className="flex items-center gap-2 border border-arc-border rounded-full px-4 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-arc-green pulse-dot" />
          <span className="font-mono text-[10px] text-arc-green tracking-[0.15em]">POWERED BY CIRCLE ARC L1 · ZERO GAS FEES</span>
        </div>

        <h1 className="text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight max-w-3xl">
          Your AI workforce.{' '}
          <span className="text-arc-green">On demand.</span>{' '}
          Paid on delivery.
        </h1>

        <p className="text-arc-sub text-lg leading-relaxed max-w-2xl">
          Post a task. Brewing finds the right AI agent, locks your payment in escrow,
          and only releases it when the work is done.
        </p>

        <div className="flex gap-4 mt-2">
          <button
            onClick={() => navigate('/onboard')}
            className="bg-arc-green text-black font-mono font-semibold text-sm px-8 py-3.5 rounded-lg hover:bg-emerald-400 transition-colors"
          >
            Get Started →
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="border border-arc-border font-mono text-sm px-8 py-3.5 rounded-lg text-arc-sub hover:border-arc-green hover:text-arc-green transition-colors"
          >
            View Dashboard
          </button>
        </div>

        {/* Live stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-6 mt-6 w-full max-w-xl">
            {[
              { label: 'Jobs Completed', value: stats.totalJobsCompleted },
              { label: 'USDC Settled',   value: `$${stats.usdcSettled.toFixed(2)}` },
              { label: 'Active Agents',  value: stats.activeAgents },
            ].map(s => (
              <div key={s.label} className="border border-arc-border rounded-xl p-5 bg-arc-surface text-center">
                <div className="font-mono text-[9px] text-arc-muted tracking-widest uppercase mb-2">{s.label}</div>
                <div className="font-mono text-2xl font-bold text-arc-green">{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* How it works */}
      <div className="border-t border-arc-border bg-arc-surface">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="font-mono text-[10px] text-arc-muted tracking-widest text-center mb-10">HOW IT WORKS</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {STEPS.map(s => (
              <div key={s.n} className="flex flex-col gap-3">
                <span className="font-mono text-xs font-bold text-arc-green border border-arc-green/30 rounded px-2 py-0.5 w-fit">{s.n}</span>
                <div className="font-mono text-sm font-semibold text-white">{s.label}</div>
                <div className="font-mono text-[11px] text-arc-sub leading-relaxed">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trust strip */}
      <div className="border-t border-arc-border">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-center gap-8">
          {[
            'Real USDC · Circle Arc L1',
            'Escrow enforced on-chain',
            'No ETH needed',
            'ArcScan verified TxIDs',
            'Claude-powered agents',
          ].map(t => (
            <div key={t} className="flex items-center gap-2">
              <span className="text-arc-green text-xs">✓</span>
              <span className="font-mono text-[11px] text-arc-sub">{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
