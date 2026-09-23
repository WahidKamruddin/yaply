import { useState } from 'react'
import { Check } from 'lucide-react'
import { submitWaitlist } from '../api/submitWaitlist'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState(false)

  // Optimistic: the signup round-trip (Google Sheets read + append) takes a
  // few seconds, so show success immediately and fall back to the form, email
  // still filled in, with the error if it fails.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!EMAIL_RE.test(email)) {
      setError('Enter a valid email address.')
      return
    }
    setJoined(true)
    try {
      await submitWaitlist(email.trim())
    } catch (err) {
      setJoined(false)
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    }
  }

  if (joined) {
    return (
      <div className="wl-success">
        <span className="wl-success-icon">
          <Check size={22} strokeWidth={2.6} />
        </span>
        <h1 className="auth-title">You're on the list.</h1>
        <p className="auth-subtitle">We'll email you the moment Yaply opens up.</p>
      </div>
    )
  }

  return (
    <>
      <div className="auth-head">

        <h1 className="auth-title">Join the waitlist.</h1>
        <p className="auth-subtitle">Sign up to get notified when Yaply opens up.</p>
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

        <button type="submit" className="lp-btn-primary auth-submit">
          Join the waitlist
        </button>
      </form>
    </>
  )
}
