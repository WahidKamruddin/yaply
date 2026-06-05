import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getUser } from '@/lib/auth'

export const Route = createFileRoute('/auth')({
  beforeLoad: async () => {
    const user = await getUser()
    if (user) throw redirect({ to: '/chat' })
  },
  component: AuthPage,
})

type Mode = 'signin' | 'signup'

function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username || email.split('@')[0] },
          },
        })
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
    <div className="min-h-screen flex items-center justify-center bg-[#edf1fa] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#5b8def] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#5b8def]/20">
            <span className="text-white font-bold text-3xl">y</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1a2744]">yaply</h1>
          <p className="text-[#9ab0cc] text-sm mt-1">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-[#dce7f8] rounded-2xl p-6 shadow-xl shadow-[#dce7f8]/40">
          {/* Toggle */}
          <div className="flex bg-[#f3f7ff] rounded-xl p-1 mb-6">
            {(['signin', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setInfo(null) }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === m
                    ? 'bg-[#5b8def] text-white shadow-sm'
                    : 'text-[#6b84ab] hover:text-[#1a2744]'
                }`}
              >
                {m === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-[#6b84ab] mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  placeholder="yourname"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full px-3 py-2.5 bg-[#f3f7ff] border border-[#dce7f8] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:border-[#5b8def]/60 focus:ring-1 focus:ring-[#5b8def]/30 transition"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#6b84ab] mb-1.5">
                Email
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 bg-[#f3f7ff] border border-[#dce7f8] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:border-[#5b8def]/60 focus:ring-1 focus:ring-[#5b8def]/30 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6b84ab] mb-1.5">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="w-full px-3 py-2.5 bg-[#f3f7ff] border border-[#dce7f8] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:border-[#5b8def]/60 focus:ring-1 focus:ring-[#5b8def]/30 transition"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {info && (
              <p className="text-sm text-[#5b8def] bg-[#edf3ff] border border-[#dce7f8] rounded-lg px-3 py-2">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#5b8def] hover:bg-[#4a7de4] text-white font-semibold text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
                : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
