import { useState, useCallback } from 'react'
import { X, Search, UserPlus, Users } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { searchUsers, createDirectConversation, createGroupConversation } from '@/features/chat/api/conversations'
import type { Profile } from '@/features/chat/types'

interface Props {
  currentUserId: string
  onClose: () => void
  onCreated: (conversationId: string) => void
}

export default function NewConversationModal({ currentUserId, onClose, onCreated }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [selected, setSelected] = useState<Profile[]>([])
  const [groupName, setGroupName] = useState('')
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const queryClient = useQueryClient()

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q)
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const found = await searchUsers(q, currentUserId)
      setResults(found)
    } finally {
      setSearching(false)
    }
  }, [currentUserId])

  function toggleSelect(profile: Profile) {
    setSelected((prev) =>
      prev.find((p) => p.id === profile.id) ? prev.filter((p) => p.id !== profile.id) : [...prev, profile],
    )
  }

  async function handleCreate() {
    if (selected.length === 0) return
    setLoading(true)
    try {
      let id: string
      if (selected.length === 1) {
        id = await createDirectConversation(currentUserId, selected[0]!.id)
      } else {
        id = await createGroupConversation(currentUserId, selected.map((p) => p.id), groupName || 'Group')
      }
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
      onCreated(id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            {selected.length > 1 ? <Users size={18} className="text-amber-400" /> : <UserPlus size={18} className="text-amber-400" />}
            {selected.length > 1 ? 'New Group' : 'New Conversation'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map((p) => (
                <span key={p.id} className="flex items-center gap-1 bg-amber-500/20 text-amber-300 text-xs rounded-full px-2.5 py-1">
                  {p.display_name ?? p.username}
                  <button onClick={() => toggleSelect(p)} className="hover:text-amber-100">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {selected.length > 1 && (
            <input
              type="text"
              placeholder="Group name (optional)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-amber-500/50"
            />
          )}

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by username..."
              value={query}
              onChange={(e) => void handleSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-amber-500/50"
            />
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1">
            {searching && <p className="text-xs text-slate-500 text-center py-3">Searching...</p>}
            {!searching && results.length === 0 && query.length >= 2 && (
              <p className="text-xs text-slate-500 text-center py-3">No users found</p>
            )}
            {results.map((profile) => {
              const isSelected = !!selected.find((p) => p.id === profile.id)
              return (
                <button
                  key={profile.id}
                  onClick={() => toggleSelect(profile)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isSelected ? 'bg-amber-500/20' : 'hover:bg-slate-800'}`}
                >
                  <div className="w-8 h-8 rounded-full bg-amber-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    {(profile.display_name ?? profile.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-sm text-slate-200 font-medium truncate">{profile.display_name ?? profile.username}</p>
                    <p className="text-xs text-slate-500 truncate">@{profile.username}</p>
                  </div>
                  {isSelected && <span className="ml-auto w-4 h-4 rounded-full bg-amber-500 flex-shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={selected.length === 0 || loading}
            className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-400 text-black rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating...' : selected.length > 1 ? 'Create Group' : 'Start Chat'}
          </button>
        </div>
      </div>
    </div>
  )
}
