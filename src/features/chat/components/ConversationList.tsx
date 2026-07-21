import { useState } from 'react'
import { Search, Plus, MessageSquare } from 'lucide-react'
import { useAtom } from 'jotai'
import { activeConversationIdAtom } from '@/features/chat/store/chat.atoms'
import { useConversations } from '@/features/chat/hooks/useConversations'
import ConversationItem from './ConversationItem'
import NewConversationModal from './NewConversationModal'
import BottomBar from './BottomBar'

interface Props {
  currentUserId: string
  userEmail: string
}

export default function ConversationList({ currentUserId, userEmail }: Props) {
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [activeId, setActiveId] = useAtom(activeConversationIdAtom)
  const { data: conversations = [], isLoading, isError } = useConversations(currentUserId)

  const filtered = conversations.filter((c) => {
    if (!search) return true
    const name = c.name ?? c.members.find((m) => m.userId !== currentUserId)?.profile.username ?? ''
    return name.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="flex flex-col h-full bg-surface border-r border-border">
      {/* Header */}
      <div className="px-4 pb-3 border-b border-border" style={{ paddingTop: `max(1.25rem, var(--safe-top))` }}>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold font-display tracking-tight text-text">Messages</h1>
          <button
            onClick={() => setShowNew(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark hover:brightness-110 text-white shadow-[0_6px_18px_rgba(91,141,239,0.35)] transition-all"
          >
            <Plus size={18} />
          </button>
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
          <div className="flex items-center justify-center h-24 text-text-subtle text-sm">Loading...</div>
        )}
        {isError && (
          <div className="flex items-center justify-center h-24 text-danger text-sm">Failed to load conversations</div>
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

      <BottomBar userId={currentUserId} userEmail={userEmail} />
    </div>
  )
}
