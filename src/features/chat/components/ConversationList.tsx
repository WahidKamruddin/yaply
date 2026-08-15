import { useState } from 'react'
import { Search, SquarePen, MessageSquare, Users } from 'lucide-react'
import { useAtom } from 'jotai'
import { useNavigate } from '@tanstack/react-router'
import { activeConversationIdAtom } from '@/features/chat/store/chat.atoms'
import { useConversations } from '@/features/chat/hooks/useConversations'
import { useFriendRequests } from '@/features/friends/hooks/useFriends'
import ConversationItem from './ConversationItem'
import ConversationItemSkeleton from './ConversationItemSkeleton'
import NewConversationModal from './NewConversationModal'
import BottomBar from './BottomBar'
import YaplyLogo from '@/components/YaplyLogo'

interface Props {
  currentUserId: string
}

export default function ConversationList({ currentUserId }: Props) {
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showRequests, setShowRequests] = useState(false)
  const [activeId, setActiveId] = useAtom(activeConversationIdAtom)
  const navigate = useNavigate()
  const { data: conversations = [], isLoading, isError } = useConversations(currentUserId)
  const { pendingCount } = useFriendRequests(currentUserId)

  const matchesSearch = (c: (typeof conversations)[number]) => {
    if (!search) return true
    const name = c.name ?? c.members.find((m) => m.userId !== currentUserId)?.profile.username ?? ''
    return name.toLowerCase().includes(search.toLowerCase())
  }

  // A DM from a non-friend sits in its own section until accepted, and a
  // declined one disappears from the list entirely.
  const visible = conversations.filter((c) => c.requestState !== 'declined').filter(matchesSearch)
  const filtered = visible.filter((c) => c.requestState === 'accepted')
  const requests = visible.filter((c) => c.requestState === 'pending')

  return (
    <div className="flex flex-col h-full bg-surface border-r border-border">
      {/* Header */}
      <div className="px-4 pb-3 border-b border-border" style={{ paddingTop: `max(1.25rem, var(--safe-top))` }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setActiveId(null)} aria-label="Open dashboard">
            <YaplyLogo variant="horizontal" size={24} />
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => void navigate({ to: '/friends' })}
              aria-label="Friends"
              className="relative w-8 h-8 flex items-center justify-center text-white [.light_&]:text-primary hover:brightness-110 transition-all"
            >
              <Users size={18} strokeWidth={2.5} />
              {pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center bg-[#5b8def] text-[10px] text-white font-semibold rounded-full px-1 border-2 border-surface box-content">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowNew(true)}
              aria-label="New conversation"
              className="w-8 h-8 flex items-center justify-center text-white [.light_&]:text-primary hover:brightness-110 transition-all"
            >
              <SquarePen size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-tint border border-border rounded-lg text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/50 focus:border-[#5b8def]/50 transition"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {isLoading && (
          <div className="space-y-0.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <ConversationItemSkeleton key={i} delay={i * 60} />
            ))}
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center h-24 text-danger text-sm">Failed to load conversations</div>
        )}

        {requests.length > 0 && (
          <div className="mb-1">
            <button
              onClick={() => setShowRequests((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-tint transition-colors"
            >
              <span className="text-[10px] font-semibold text-text-subtle uppercase tracking-wide">
                Message requests
              </span>
              <span className="min-w-[18px] h-[18px] flex items-center justify-center bg-tint-strong text-xs text-text-muted font-semibold rounded-full px-1">
                {requests.length}
              </span>
            </button>
            {showRequests &&
              requests.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  currentUserId={currentUserId}
                  isActive={activeId === conv.id}
                  onClick={() => setActiveId(conv.id)}
                />
              ))}
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-text-subtle gap-2">
            <MessageSquare size={32} strokeWidth={1.5} />
            <p className="text-sm">{search ? 'No results' : 'No conversations yet'}</p>
          </div>
        )}
        {filtered.map((conv) => (
          <ConversationItem
            key={conv.id}
            conversation={conv}
            currentUserId={currentUserId}
            isActive={activeId === conv.id}
            onClick={() => setActiveId(conv.id)}
          />
        ))}
      </div>

      {showNew && (
        <NewConversationModal
          currentUserId={currentUserId}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setActiveId(id)
            setShowNew(false)
          }}
        />
      )}

      <BottomBar userId={currentUserId} />
    </div>
  )
}
