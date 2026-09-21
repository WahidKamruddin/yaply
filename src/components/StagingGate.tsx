import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import YaplyLogo from './YaplyLogo'

const STORAGE_KEY = 'yaply-staging-unlocked'
const PASSCODE = 'yapry67'

/**
 * Staging-only access gate. Only renders when VITE_STAGING_GATE=true, which
 * must never be set on the production Netlify site — this must never reach
 * anyone on main. Client-side only; not a real auth boundary, just a filter
 * to keep the staging deploy off search engines and casual visitors.
 */
export default function StagingGate({ children }: { children: React.ReactNode }) {
  const gateEnabled = import.meta.env.VITE_STAGING_GATE === 'true'

  if (!gateEnabled) return <>{children}</>

  return <Gate>{children}</Gate>
}

function Gate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'true') setUnlocked(true)
    } catch {
      // ignore — private mode / blocked storage just means re-entering the code
    }
  }, [])

  if (unlocked) return <>{children}</>

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (input === PASSCODE) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true')
      } catch {
        // ignore
      }
      setUnlocked(true)
      setError(false)
    } else {
      setError(true)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-background px-6">
      <YaplyLogo size={48} variant="mark" />
      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col items-center gap-3 text-center">
        <div className="space-y-1">
          <h1 className="text-lg font-medium text-text">Staging access</h1>
          <p className="text-sm text-text-muted">Enter the passcode to continue.</p>
        </div>
        <input
          type="password"
          autoFocus
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setError(false)
          }}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary"
          placeholder="Passcode"
        />
        {error && <p className="text-sm text-red-500">Incorrect passcode.</p>}
        <button
          type="submit"
          className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Continue
        </button>
      </form>
    </div>
  )
}
