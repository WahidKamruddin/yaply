import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { getSession, getUser } from '@/lib/auth'
import DevicePairingSettings from '@/features/settings/components/DevicePairingSettings'
import LoadingScreen from '@/components/LoadingScreen'
import type { User } from '@supabase/supabase-js'

// Landing point for the pairing QR's deep link. The code lives in the URL
// fragment (never the query string) so it stays out of server logs, proxies
// and the Referer header — which is why it's read here from
// window.location.hash rather than from route search params.
export const Route = createFileRoute('/link')({
  beforeLoad: async () => {
    if (typeof document === 'undefined') return // SSR — no session, client handles it
    const session = await getSession()
    // Preserve the fragment across the auth bounce: the browser keeps the hash
    // on a client-side redirect, but be explicit rather than relying on it.
    if (!session) throw redirect({ to: '/auth', hash: window.location.hash.replace(/^#/, '') })
  },
  component: LinkPage,
})

function LinkPage() {
  const [user, setUser] = useState<User | null>(null)
  const [code, setCode] = useState<string | undefined>(undefined)

  useEffect(() => {
    void getUser().then(setUser)
    const match = /c=([0-9A-Za-z]+)/.exec(window.location.hash)
    if (match) setCode(match[1])
  }, [])

  if (!user) return <LoadingScreen />

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          to="/chat"
          className="inline-flex items-center gap-1.5 text-sm text-text-subtle hover:text-text transition-colors mb-6"
        >
          <ArrowLeft size={15} /> Back to chats
        </Link>
        <h1 className="text-xl font-semibold text-text mb-6">Link this device</h1>
        <DevicePairingSettings userId={user.id} initialCode={code} />
      </div>
    </div>
  )
}
