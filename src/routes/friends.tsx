import { createFileRoute, redirect, useNavigate, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Ban, Inbox, Search, Send, Sparkles, Users, X } from 'lucide-react'
import { getSession, getUser, onAuthStateChange } from '@/lib/auth'
import LoadingScreen from '@/components/LoadingScreen'
import FriendsList from '@/features/friends/components/FriendsList'
import FriendRequestsList from '@/features/friends/components/FriendRequestsList'
import PeopleYouMayKnow from '@/features/friends/components/PeopleYouMayKnow'
import BlockedUsersList from '@/features/friends/components/BlockedUsersList'
import PeopleSearchResults from '@/features/friends/components/PeopleSearchResults'
import { useFriendRequests } from '@/features/friends/hooks/useFriends'
import type { User } from '@supabase/supabase-js'

export const Route = createFileRoute('/friends')({
  beforeLoad: async () => {
    if (typeof document === 'undefined') return // SSR — no localStorage, client handles it
    const session = await getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: FriendsPage,
})

type Tab = 'friends' | 'requests' | 'sent' | 'discover' | 'blocked'

const TABS: Array<{ id: Tab; label: string; Icon: React.ElementType }> = [
  { id: 'friends', label: 'Friends', Icon: Users },
  { id: 'requests', label: 'Requests', Icon: Inbox },
  { id: 'sent', label: 'Sent', Icon: Send },
  { id: 'discover', label: 'Discover', Icon: Sparkles },
  { id: 'blocked', label: 'Blocked', Icon: Ban },
]

function FriendsPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('friends')
  const [search, setSearch] = useState('')

  const openProfile = useCallback(
    (username: string) => {
      void navigate({ to: '/profile/$username', params: { username } })
    },
    [navigate],
  )

  useEffect(() => {
    void getUser().then(setUser)

    const { data: listener } = onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session) void navigate({ to: '/auth' })
    })

    return () => listener.subscription.unsubscribe()
  }, [navigate])

  const { pendingCount } = useFriendRequests(user?.id)

  if (!user) return <LoadingScreen />

  // A live query takes over the panel regardless of tab — searching for someone
  // is a different intent from browsing a list, and making it a sixth tab would
  // bury the primary way people get added.
  const searching = search.trim().length >= 2

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface flex-shrink-0"
        style={{ paddingTop: `max(0.75rem, var(--safe-top))` }}
      >
        <Link
          to="/chat"
          className="w-9 h-9 flex items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-tint transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-base font-semibold font-display text-text">Friends</h1>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Tab nav */}
        <nav className="md:w-56 flex-shrink-0 border-b md:border-b-0 md:border-r border-border bg-surface overflow-x-auto md:overflow-y-auto">
          <div className="flex md:flex-col p-2 gap-0.5">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setActiveTab(id)
                  setSearch('')
                }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left whitespace-nowrap transition-colors flex-shrink-0 ${
                  activeTab === id && !searching
                    ? 'bg-primary-tint text-primary-text'
                    : 'text-text-muted hover:bg-tint hover:text-text'
                }`}
              >
                <Icon size={15} />
                {label}
                {id === 'requests' && pendingCount > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center bg-[#5b8def] text-xs text-white font-semibold rounded-full px-1">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* Panel */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-4 md:p-6">
            <div className="relative mb-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
              <input
                type="text"
                placeholder="Search people by name or username"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-tint border border-border text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/50 focus:border-[#5b8def]/50 transition"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text transition-colors"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {searching ? (
              <PeopleSearchResults
                query={search.trim()}
                currentUserId={user.id}
                onOpenProfile={openProfile}
              />
            ) : (
              <>
                {activeTab === 'friends' && (
                  <FriendsList
                    currentUserId={user.id}
                    onOpenProfile={openProfile}
                    onFindFriends={() => setActiveTab('discover')}
                  />
                )}
                {activeTab === 'requests' && (
                  <FriendRequestsList
                    currentUserId={user.id}
                    direction="incoming"
                    onOpenProfile={openProfile}
                  />
                )}
                {activeTab === 'sent' && (
                  <FriendRequestsList
                    currentUserId={user.id}
                    direction="outgoing"
                    onOpenProfile={openProfile}
                  />
                )}
                {activeTab === 'discover' && (
                  <PeopleYouMayKnow currentUserId={user.id} onOpenProfile={openProfile} />
                )}
                {activeTab === 'blocked' && (
                  <BlockedUsersList currentUserId={user.id} onOpenProfile={openProfile} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
