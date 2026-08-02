import { createFileRoute, redirect, useNavigate, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import YaplyLogo from '@/components/YaplyLogo'

export const Route = createFileRoute('/auth')({
  beforeLoad: async () => {
    if (typeof document === 'undefined') return // SSR — no localStorage, client handles it
    const session = await getSession()
    if (session) throw redirect({ to: '/chat' })
  },
  component: AuthPage,
})

type Mode = 'signin' | 'signup'

function AuthPage() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [light, setLight] = useState(false)

  // Theme: same 'yaply-theme' key as the landing page, so the choice carries over.
  useEffect(() => {
    const saved = localStorage.getItem('yaply-theme')
    if (saved === 'light') setLight(true)
    else if (saved === 'dark') setLight(false)
    else setLight(window.matchMedia('(prefers-color-scheme: light)').matches)
  }, [])
  useEffect(() => {
    rootRef.current?.classList.toggle('lp-light', light)
  }, [light])
  useEffect(() => {
    const bg = light ? '#eef2fb' : '#070d1a'
    document.documentElement.style.backgroundColor = bg
    document.body.style.backgroundColor = bg
    return () => {
      document.documentElement.style.backgroundColor = ''
      document.body.style.backgroundColor = ''
    }
  }, [light])
  const toggleTheme = () => {
    setLight((v) => {
      localStorage.setItem('yaply-theme', v ? 'dark' : 'light')
      return !v
    })
  }

  const spotlight = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }, [])

  async function handleGoogleSignIn() {
    setError(null)
    setInfo(null)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth` },
    })
    if (oauthError) setError(oauthError.message)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)

    try {
      if (mode === 'signup') {
        if (password !== confirmPassword) {
          setError('Passwords do not match.')
          return
        }
        const { error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) throw signUpError
        setInfo('Check your email to confirm your account, then sign in.')
        setMode('signin')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        await navigate({ to: '/chat' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={rootRef} className="lp">
      <style>{AUTH_CSS}</style>

      <div className="lp-orb lp-orb-a" aria-hidden="true" />
      <div className="lp-orb lp-orb-c" aria-hidden="true" />
      <div className="lp-grid-tex" aria-hidden="true" />

      <button
        type="button"
        className="lp-theme-corner"
        onClick={toggleTheme}
        aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {light ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4.5" />
            <line x1="12" y1="1.5" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22.5" />
            <line x1="3.3" y1="3.3" x2="5.1" y2="5.1" /><line x1="18.9" y1="18.9" x2="20.7" y2="20.7" />
            <line x1="1.5" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22.5" y2="12" />
            <line x1="3.3" y1="20.7" x2="5.1" y2="18.9" /><line x1="18.9" y1="5.1" x2="20.7" y2="3.3" />
          </svg>
        )}
      </button>

      <div className="auth-shell">
        <div className="auth-wrap">
          <div className="auth-card lp-glass" onMouseMove={spotlight}>
            <Link to="/" aria-label="Go to yaply home" className="auth-brand">
              <YaplyLogo variant="mark" size={48} />
            </Link>

            <div className="auth-head">
              <h1 className="auth-title">{mode === 'signin' ? 'Welcome back.' : 'Create your account.'}</h1>
              <p className="auth-subtitle">
                {mode === 'signin' ? 'Sign in to keep the conversation going.' : 'Takes less than a minute.'}
              </p>
            </div>

            <div className="lp-seg auth-seg" role="tablist" aria-label="Sign in or sign up">
              <span
                className="lp-seg-thumb"
                aria-hidden="true"
                style={{ transform: mode === 'signup' ? 'translateX(calc(100% + 3px))' : 'translateX(0)' }}
              />
              {(['signin', 'signup'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  className={mode === m ? 'lp-seg-on' : ''}
                  onClick={() => { setMode(m); setError(null); setInfo(null); setConfirmPassword('') }}
                >
                  {m === 'signin' ? 'Sign in' : 'Sign up'}
                </button>
              ))}
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="auth-form">
              <div className="auth-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="auth-field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </div>

              {mode === 'signup' && (
                <div className="auth-field">
                  <label htmlFor="confirm-password">Confirm password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
              )}

              {error && <p className="auth-banner auth-error">{error}</p>}
              {info && <p className="auth-banner auth-info">{info}</p>}

              <button type="submit" disabled={loading} className="lp-btn-primary auth-submit">
                {loading
                  ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
                  : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <div className="auth-divider" role="separator">
              <span>or continue with Google</span>
            </div>

            <button
              type="button"
              className="auth-oauth"
              onClick={() => void handleGoogleSignIn()}
              disabled={loading}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
                <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
                <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.93 21.93 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
                <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
              </svg>
              Continue with Google
            </button>
          </div>

          <p className="auth-foot">
            <Link to="/">← Back to yaply</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Styles — mirrors the landing page's token set (src/routes/index.tsx) */
/* so the jump from marketing page to auth never feels like a new app. */
/* ------------------------------------------------------------------ */

const AUTH_CSS = `
@font-face {
  font-family: 'Bricolage Grotesque';
  src: url('/fonts/BricolageGrotesque-var-latin.woff2') format('woff2-variations');
  font-weight: 200 800;
  font-display: swap;
}

.lp {
  --bg: #070d1a;
  --ink: #e9eefb;
  --dim: #8ba1c7;
  --faint: #5c718f;
  --blue: #5b8def;
  --sky: #8fb8ff;
  --mint: #6fe0b8;
  --mint-soft: rgba(111, 224, 184, 0.08);
  --mint-line: rgba(111, 224, 184, 0.25);
  --line: rgba(143, 184, 255, 0.13);
  --glass: rgba(143, 184, 255, 0.055);
  --tint: rgba(143, 184, 255, 0.1);
  --spot: rgba(143, 184, 255, 0.09);
  --card-shadow: 0 32px 80px rgba(3, 7, 18, 0.6);
  --disp: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif;
  --mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--bg);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  min-height: 100vh;
  overflow-x: clip;
  -webkit-font-smoothing: antialiased;
  transition: background 0.45s, color 0.45s;
}
.lp-light {
  --bg: #eef2fb;
  --ink: #17233f;
  --dim: #53688f;
  --faint: #8ba0c2;
  --mint: #0b9e74;
  --mint-soft: rgba(11, 158, 116, 0.07);
  --mint-line: rgba(11, 158, 116, 0.3);
  --line: rgba(23, 35, 63, 0.11);
  --glass: rgba(255, 255, 255, 0.55);
  --tint: rgba(23, 35, 63, 0.06);
  --spot: rgba(91, 141, 239, 0.1);
  --card-shadow: 0 28px 70px rgba(23, 35, 63, 0.16);
}
.lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
.lp ::selection { background: rgba(91,141,239,0.4); }
.lp-light ::selection { background: rgba(91,141,239,0.25); }

/* ---- background atmosphere (matches hero) ---- */
.lp-orb {
  position: fixed; border-radius: 50%; filter: blur(90px);
  pointer-events: none; z-index: 0;
}
.lp-orb-a {
  width: 560px; height: 560px; top: -160px; right: -120px;
  background: radial-gradient(circle, rgba(91,141,239,0.28), transparent 65%);
}
.lp-orb-c {
  width: 340px; height: 340px; bottom: -140px; left: -100px;
  background: radial-gradient(circle, rgba(111,224,184,0.10), transparent 65%);
}
.lp-light .lp-orb-a { background: radial-gradient(circle, rgba(91,141,239,0.2), transparent 65%); }
.lp-light .lp-orb-c { background: radial-gradient(circle, rgba(11,158,116,0.1), transparent 65%); }
.lp-grid-tex {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image: radial-gradient(circle, rgba(143,184,255,0.10) 1px, transparent 1px);
  background-size: 30px 30px;
  mask-image: radial-gradient(ellipse 65% 55% at 50% 32%, #000 25%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse 65% 55% at 50% 32%, #000 25%, transparent 75%);
}
.lp-light .lp-grid-tex { background-image: radial-gradient(circle, rgba(23,35,63,0.13) 1px, transparent 1px); }

/* ---- theme toggle corner ---- */
.lp-theme-corner {
  position: fixed;
  top: max(16px, var(--safe-top, 0px));
  right: max(16px, var(--safe-right, 0px));
  z-index: 55;
  width: 38px; height: 38px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--glass);
  border: 1px solid var(--line);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  color: var(--dim); cursor: pointer;
  box-shadow: 0 10px 28px rgba(3,7,18,0.35);
  transition: color 0.2s, background 0.2s, border-color 0.3s, transform 0.3s;
}
.lp-theme-corner:hover { color: var(--ink); background: var(--tint); transform: rotate(18deg); }

/* ---- eyebrow badge ---- */
.lp-eyebrow {
  display: inline-flex; align-items: center; gap: 9px;
  margin: 0; font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--mint);
  padding: 6px 12px; border-radius: 999px;
  border: 1px solid var(--mint-line);
  background: var(--mint-soft);
}
.lp-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--mint);
  animation: lp-pulse 2.2s ease-out infinite;
}
@keyframes lp-pulse {
  0% { box-shadow: 0 0 0 0 rgba(111,224,184,0.45); }
  70% { box-shadow: 0 0 0 9px rgba(111,224,184,0); }
  100% { box-shadow: 0 0 0 0 rgba(111,224,184,0); }
}

/* ---- glass card + cursor spotlight ---- */
.lp-glass {
  position: relative;
  border-radius: 20px;
  border: 1px solid var(--line);
  background: var(--glass);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: var(--card-shadow), inset 0 1px 0 rgba(255,255,255,0.06);
  overflow: hidden;
  transition: background 0.45s, border-color 0.45s;
}
.lp-glass::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(340px circle at var(--mx, 50%) var(--my, 50%), var(--spot), transparent 65%);
  opacity: 0; transition: opacity 0.3s;
  pointer-events: none;
}
.lp-glass:hover::before { opacity: 1; }

/* ---- segmented toggle ---- */
.lp-seg {
  position: relative;
  display: flex; gap: 3px; padding: 3px;
  border-radius: 999px;
  background: var(--tint); border: 1px solid var(--line);
}
.lp-seg-thumb {
  position: absolute; top: 3px; bottom: 3px; left: 3px;
  width: calc(50% - 4.5px);
  border-radius: 999px;
  background: linear-gradient(120deg, var(--blue), #3b6fe0);
  box-shadow: 0 6px 18px rgba(91,141,239,0.38), inset 0 1px 0 rgba(255,255,255,0.2);
  transition: transform 0.45s cubic-bezier(0.65, 0, 0.35, 1);
  will-change: transform;
}
.lp-seg button {
  position: relative; z-index: 1;
  padding: 8px 14px; border-radius: 999px; border: none; cursor: pointer;
  background: transparent; color: var(--dim);
  font-size: 13px; font-weight: 600;
  transition: color 0.3s ease 0.05s;
}
.lp-seg .lp-seg-on {
  color: #fff;
}

/* ---- primary button ---- */
.lp-btn-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  padding: 14px 26px; border-radius: 999px; border: none; cursor: pointer;
  background: linear-gradient(120deg, var(--blue), #3b6fe0);
  color: #fff; text-decoration: none; font-weight: 650; font-size: 15px; letter-spacing: -0.01em;
  font-family: inherit;
  box-shadow: 0 10px 34px rgba(91,141,239,0.36), inset 0 1px 0 rgba(255,255,255,0.22);
  transition: transform 0.16s, box-shadow 0.2s, opacity 0.2s;
}
.lp-btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 16px 44px rgba(91,141,239,0.5), inset 0 1px 0 rgba(255,255,255,0.22); }
.lp-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

/* ---- auth page layout ---- */
.auth-shell {
  position: relative; z-index: 1;
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  padding: 90px 20px 60px;
}
.auth-wrap {
  width: min(400px, 100%);
  display: flex; flex-direction: column; align-items: center;
}
.auth-card {
  width: 100%;
  padding: 38px 32px 34px;
  border-radius: 26px;
  display: flex; flex-direction: column; align-items: center; gap: 20px;
  animation: auth-in 0.6s cubic-bezier(0.22,1,0.36,1) both;
}
@keyframes auth-in {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: none; }
}
.auth-brand { display: flex; transition: opacity 0.2s; }
.auth-brand:hover { opacity: 0.8; }
.auth-head { text-align: center; }
.auth-title {
  margin: 0 0 6px;
  font-family: var(--disp);
  font-size: clamp(23px, 5vw, 27px);
  font-weight: 720; letter-spacing: -0.02em; line-height: 1.15;
}
.auth-subtitle { margin: 0; color: var(--dim); font-size: 14px; line-height: 1.5; }

.auth-seg { width: 100%; }
.auth-seg button { flex: 1; }

.auth-oauth {
  width: 100%;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 12px 20px; border-radius: 999px;
  background: var(--tint); border: 1px solid var(--line);
  color: var(--ink); font-weight: 600; font-size: 14px; font-family: inherit;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.16s, opacity 0.2s;
}
.auth-oauth:hover:not(:disabled) { background: var(--glass); border-color: var(--dim); transform: translateY(-1px); }
.auth-oauth:disabled { opacity: 0.55; cursor: not-allowed; }

.auth-divider {
  width: 100%;
  display: flex; align-items: center; gap: 12px;
}
.auth-divider::before, .auth-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--line);
}
.auth-divider span {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--faint); white-space: nowrap;
}

.auth-form { width: 100%; display: flex; flex-direction: column; gap: 14px; }
.auth-field { display: flex; flex-direction: column; gap: 6px; text-align: left; }
.auth-field label {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--faint);
}
.auth-field input {
  width: 100%; padding: 11px 14px; border-radius: 12px;
  background: var(--tint); border: 1px solid var(--line);
  color: var(--ink); font-size: 14px; font-family: inherit;
  outline: none;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}
.auth-field input::placeholder { color: var(--faint); }
.auth-field input:focus {
  border-color: var(--blue); background: var(--glass);
  box-shadow: 0 0 0 3px rgba(91,141,239,0.15);
}

.auth-banner { margin: 0; border-radius: 12px; padding: 10px 13px; font-size: 13px; line-height: 1.5; }
.auth-error { background: rgba(255,99,99,0.1); border: 1px solid rgba(255,99,99,0.28); color: #ff9b9b; }
.lp-light .auth-error { background: rgba(220,38,38,0.07); border: 1px solid rgba(220,38,38,0.22); color: #c22; }
.auth-info { background: var(--mint-soft); border: 1px solid var(--mint-line); color: var(--mint); }

.auth-submit { width: 100%; margin-top: 4px; }

.auth-foot { margin: 22px 0 0; text-align: center; font-size: 13px; }
.auth-foot a { color: var(--dim); text-decoration: none; font-family: var(--mono); font-size: 12.5px; transition: color 0.2s; }
.auth-foot a:hover { color: var(--ink); }

@media (max-width: 420px) {
  .auth-card { padding: 32px 24px 28px; border-radius: 22px; }
}
`
