import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { submitWaitlist } from '../api/submitWaitlist'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!EMAIL_RE.test(email)) {
      setError('Enter a valid email address.')
      return
    }
    setLoading(true)
    try {
      await submitWaitlist(email.trim())
      setJoined(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (joined) {
    return (
      <div className="wl-success">
        <span className="wl-success-icon">
          <Check size={22} strokeWidth={2.6} />
        </span>
        <h1 className="auth-title">You're on the list.</h1>
        <p className="auth-subtitle">We'll email you the moment yaply opens up.</p>
      </div>
    )
  }

  return (
    <>
      <div className="auth-head">
        <span className="lp-eyebrow wl-eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Coming soon
        </span>
        <h1 className="auth-title">Join the waitlist.</h1>
        <p className="auth-subtitle">yaply isn't open yet — leave your email and we'll let you know the moment it is.</p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="auth-form">
        <div className="auth-field">
          <label htmlFor="wl-email">Email</label>
          <input
            id="wl-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
            autoComplete="email"
          />
        </div>

        {error && <p className="auth-banner auth-error">{error}</p>}

        <button type="submit" disabled={loading} className="lp-btn-primary auth-submit">
          {loading ? 'Joining…' : 'Join the waitlist'}
        </button>
      </form>
    </>
  )
}
