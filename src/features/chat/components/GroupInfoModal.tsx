import { useState, useCallback } from 'react'
import { X, UserPlus, Trash2, Search, Crown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { searchUsers, addGroupMember, removeGroupMember } from '@/features/chat/api/conversations'
import type { ConversationListItem, Profile } from '@/features/chat/types'

interface Props {
  conversation: ConversationListItem
  currentUserId: string
  onClose: () => void
}

export default function GroupInfoModal({ conversation, currentUserId, onClose }: Props) {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)

  const currentMember = conversation.members.find((m) => m.userId === currentUserId)
  const isAdminOrOwner = currentMember?.isAdmin ?? false

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q)
    if (!q.trim()) { setSearchResults([]); return }
    const results = await searchUsers(q, currentUserId)
    const memberIds = new Set(conversation.members.map((m) => m.userId))
    setSearchResults(results.filter((u) => !memberIds.has(u.id)))
  }, [currentUserId, conversation.members])

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['conversations'] })

  const handleAdd = useCallback(async (user: Profile) => {
    setAdding(user.id)
    try {
      await addGroupMember(conversation.id, user.id)
      refresh()
      setSearchQuery('')
      setSearchResults([])
      setShowSearch(false)
    } catch { /* ignore */ }
    setAdding(null)
  }, [conversation.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemove = useCallback(async (userId: string) => {
    setRemoving(userId)
    try {
      await removeGroupMember(conversation.id, userId)
      refresh()
    } catch { /* ignore */ }
    setRemoving(null)
  }, [conversation.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a2744]/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#dce7f8]">
          <h2 className="text-sm font-semibold text-[#1a2744]">Group info</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-[#1a2744] hover:bg-[#edf1fa] transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Group identity */}
        <div className="flex flex-col items-center gap-2 pt-5 pb-4 border-b border-[#dce7f8]">
          <div className="w-14 h-14 rounded-full bg-[#5b8def] flex items-center justify-center text-white text-xl font-semibold">
            {(conversation.name ?? 'G').charAt(0).toUpperCase()}
          </div>
          <p className="text-sm font-semibold text-[#1a2744]">{conversation.name ?? 'Group'}</p>
          <p className="text-xs text-[#9ab0cc]">{conversation.members.length} members</p>
        </div>

        {/* Member list */}
        <div className="max-h-60 overflow-y-auto px-3 py-2">
          {conversation.members.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[#f3f7ff]">
              <div className="relative w-8 h-8 flex-shrink-0">
                {m.profile.avatar_url ? (
                  <img src={m.profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full rounded-full bg-[#5b8def] flex items-center justify-center text-white text-xs font-semibold">
                    {(m.profile.display_name ?? m.profile.username).charAt(0).toUpperCase()}
                  </div>
                )}
                {m.profile.is_online && (
                  <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border border-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#1a2744] truncate">
                  {m.profile.display_name ?? m.profile.username}
                  {m.userId === currentUserId && (
                    <span className="text-[#9ab0cc] font-normal"> (you)</span>
                  )}
                </p>
              </div>
              {m.isAdmin && (
                <Crown size={11} className="text-[#5b8def] flex-shrink-0" />
              )}
              {isAdminOrOwner && m.userId !== currentUserId && (
                <button
                  onClick={() => void handleRemove(m.userId)}
                  disabled={removing === m.userId}
                  className="w-6 h-6 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add member */}
        {isAdminOrOwner && (
          <div className="border-t border-[#dce7f8] px-4 py-3">
            {!showSearch ? (
              <button
                onClick={() => setShowSearch(true)}
                className="flex items-center gap-2 text-sm text-[#5b8def] font-medium hover:text-[#4a7de4] transition-colors"
              >
                <UserPlus size={14} />
                Add member
              </button>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ab0cc]" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search by username…"
                    value={searchQuery}
                    onChange={(e) => void handleSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
                  />
                </div>
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => void handleAdd(u)}
                    disabled={adding === u.id}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#f3f7ff] text-left disabled:opacity-40 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-[#5b8def] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                      {(u.display_name ?? u.username).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-medium text-[#1a2744]">{u.display_name ?? u.username}</span>
                    <span className="text-xs text-[#9ab0cc] ml-auto">@{u.username}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
