import { useState } from 'react'
import { Search, Plus, MessageSquare, LogOut } from 'lucide-react'
import { useAtom } from 'jotai'
import { activeConversationIdAtom } from '@/features/chat/store/chat.atoms'
import { useConversations } from '@/features/chat/hooks/useConversations'
import { supabase } from '@/lib/supabase'
import ConversationItem from './ConversationItem'
import NewConversationModal from './NewConversationModal'

interface Props {
  currentUserId: string
  className?: string
}

export default function ConversationList({ currentUserId, className = '' }: Props) {
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
    <div className={`flex flex-col h-full bg-white border-r border-[#dce7f8] ${className}`}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-[#dce7f8]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-[#1a2744]">Messages</h1>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowNew(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#5b8def] hover:bg-[#4a7de4] text-white transition-colors"
            >
              <Plus size={18} />
            </button>
            <button
              onClick={() => void supabase.auth.signOut()}
              title="Sign out"
              className="w-8 h-8 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-[#1a2744] hover:bg-[#edf1fa] transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ab0cc]" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40 transition"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {isLoading && (
          <div className="flex items-center justify-center h-24 text-[#9ab0cc] text-sm">Loading...</div>
        )}
        {isError && (
          <div className="flex items-center justify-center h-24 text-red-400 text-sm">Failed to load conversations</div>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-[#9ab0cc] gap-2">
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
    </div>
  )
}
