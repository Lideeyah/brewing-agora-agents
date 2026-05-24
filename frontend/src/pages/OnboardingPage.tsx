import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API      = import.meta.env.VITE_ARC_API_URL ?? 'http://localhost:8000'
const FAUCET   = 'https://faucet.circle.com'
const EXPLORER = 'https://testnet.arcscan.app'

type Step = 'form' | 'creating' | 'done'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep]       = useState<Step>('form')
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [error, setError]     = useState('')
  const [wallet, setWallet]   = useState<{ address: string; balance_usdc: number; business_id: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setError('')
    setStep('creating')

    try {
      const res  = await fetch(`${API}/api/onboard`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), email: email.trim() }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()

      // Persist to localStorage so Dashboard can read it
      localStorage.setItem('brewing_employer_address', data.wallet_address)
      localStorage.setItem('brewing_employer_name', name.trim())
      localStorage.setItem('brewing_business_id', data.business_id)

      setWallet({ address: data.wallet_address, balance_usdc: data.balance_usdc, business_id: data.business_id })
      setStep('done')
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Something went wrong')
      setStep('form')
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      {/* Nav */}
      <nav className="border-b border-arc-border bg-black/90">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="font-mono font-bold text-sm tracking-[0.2em] hover:text-arc-green transition-colors">
            BREWING
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-arc-green pulse-dot" />
            <span className="font-mono text-[11px] text-arc-green">Arc Testnet Live</span>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">

          {/* Step: Form */}
          {step === 'form' && (
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-2">
                <div className="font-mono text-[10px] text-arc-muted tracking-widest">STEP 01 OF 02</div>
                <h1 className="text-2xl font-bold">Create your account</h1>
                <p className="font-mono text-[12px] text-arc-sub leading-relaxed">
                  Enter your details and we'll create a Circle-managed wallet for you on Arc Testnet.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-mono text-[10px] text-arc-muted tracking-widest uppercase">Company / Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Acme Corp"
                    required
                    className="bg-arc-surface border border-arc-border rounded-lg px-4 py-3 font-mono text-sm text-white placeholder-arc-muted focus:outline-none focus:border-arc-green transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-mono text-[10px] text-arc-muted tracking-widest uppercase">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="bg-arc-surface border border-arc-border rounded-lg px-4 py-3 font-mono text-sm text-white placeholder-arc-muted focus:outline-none focus:border-arc-green transition-colors"
                  />
                </div>

                {error && (
                  <div className="border border-red-500/20 rounded-lg px-4 py-3 bg-red-500/5">
                    <span className="font-mono text-xs text-red-400">{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="bg-arc-green text-black font-mono font-semibold text-sm px-6 py-3 rounded-lg hover:bg-emerald-400 transition-colors mt-2"
                >
                  Create Wallet →
                </button>
              </form>
            </div>
          )}

          {/* Step: Creating */}
          {step === 'creating' && (
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="w-12 h-12 border-2 border-arc-green border-t-transparent rounded-full animate-spin" />
              <div className="flex flex-col gap-2">
                <div className="font-mono text-[10px] text-arc-muted tracking-widest">PROVISIONING WALLET</div>
                <p className="font-mono text-sm text-arc-sub">Creating your Circle DCW on Arc Testnet…</p>
              </div>
              <div className="border border-arc-border rounded-xl bg-arc-surface p-5 w-full text-left flex flex-col gap-2">
                {[
                  '✓ Connecting to Circle MPC',
                  '✓ Generating Arc L1 wallet',
                  '⟳ Registering on-chain…',
                ].map((line, i) => (
                  <div key={i} className={`font-mono text-[11px] ${line.startsWith('✓') ? 'text-arc-green' : 'text-arc-sub'}`}>{line}</div>
                ))}
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && wallet && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="font-mono text-[10px] text-arc-muted tracking-widest">STEP 02 OF 02</div>
                <h1 className="text-2xl font-bold">Wallet created <span className="text-arc-green">✓</span></h1>
              </div>

              <div className="border border-arc-green/20 rounded-xl bg-arc-green/5 p-5 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <div className="font-mono text-[9px] text-arc-muted tracking-widest uppercase">Your Arc Wallet</div>
                  <div className="font-mono text-xs text-white break-all">{wallet.address}</div>
                </div>
                <div className="flex items-center justify-between border-t border-arc-green/10 pt-3">
                  <div className="font-mono text-[9px] text-arc-muted tracking-widest uppercase">USDC Balance</div>
                  <div className="font-mono text-lg font-bold text-arc-green">{wallet.balance_usdc.toFixed(4)} USDC</div>
                </div>
              </div>

              {wallet.balance_usdc === 0 && (
                <div className="border border-arc-border rounded-xl bg-arc-surface p-5 flex flex-col gap-3">
                  <div className="font-mono text-[10px] text-arc-muted tracking-widest uppercase">Fund Your Wallet</div>
                  <p className="font-mono text-[11px] text-arc-sub leading-relaxed">
                    Get 20 free USDC from the Circle testnet faucet to start posting tasks.
                  </p>
                  <div className="font-mono text-[10px] text-arc-muted border border-arc-border rounded px-3 py-2 bg-black break-all">
                    {wallet.address}
                  </div>
                  <a
                    href={FAUCET}
                    target="_blank"
                    rel="noreferrer"
                    className="border border-arc-border font-mono text-xs px-4 py-2.5 rounded-lg text-arc-sub hover:border-arc-green hover:text-arc-green transition-colors text-center"
                  >
                    Open Circle Faucet ↗
                  </a>
                  <a
                    href={`${EXPLORER}/address/${wallet.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] text-arc-muted hover:text-arc-green transition-colors text-center"
                  >
                    View on ArcScan ↗
                  </a>
                </div>
              )}

              <button
                onClick={() => navigate('/dashboard')}
                className="bg-arc-green text-black font-mono font-semibold text-sm px-6 py-3 rounded-lg hover:bg-emerald-400 transition-colors"
              >
                Go to Dashboard →
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
