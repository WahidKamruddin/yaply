import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { getSession, getUser, onAuthStateChange } from '@/lib/auth'
import LoadingScreen from '@/components/LoadingScreen'
import ProfileView from '@/features/friends/components/ProfileView'
import type { User } from '@supabase/supabase-js'

export const Route = createFileRoute('/profile/$username')({
  beforeLoad: async () => {
    if (typeof document === 'undefined') return // SSR — no localStorage, client handles it
    const session = await getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: ProfilePage,
})

function ProfilePage() {
  const { username } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    void getUser().then(setUser)

    const { data: listener } = onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session) void navigate({ to: '/auth' })
    })

    return () => listener.subscription.unsubscribe()
  }, [navigate])

  if (!user) return <LoadingScreen />

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) router.history.back()
    else void navigate({ to: '/chat' })
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface flex-shrink-0"
        style={{ paddingTop: `max(0.75rem, var(--safe-top))` }}
      >
        <button
          onClick={goBack}
          aria-label="Back"
          className="w-9 h-9 flex items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-tint transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-semibold font-display text-text">Profile</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 md:p-6">
          <ProfileView username={username} currentUserId={user.id} />
        </div>
      </div>
    </div>
  )
}
