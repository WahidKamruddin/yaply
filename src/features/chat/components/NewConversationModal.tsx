import { useState, useCallback, useEffect } from 'react'
import { X, Search, UserPlus, Users } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { searchUsers, createDirectConversation, createGroupConversation } from '@/features/chat/api/conversations'
import { useRelationships } from '@/features/friends/hooks/useFriends'
import Avatar from '@/components/Avatar'
import type { Profile } from '@/features/chat/types'

/** Server-side rejections, phrased for a person rather than a stack trace. */
function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : ''
  if (message.includes('can only add friends to groups')) {
    return 'You can only add friends to a group. Send them a friend request first.'
  }
  if (message.includes('blocked')) return "You can't message this user right now."
  return 'Something went wrong. Please try again.'
}

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
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Debounced so a fast typist doesn't fire a query per keystroke against the
  // search_users RPC.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (debouncedQuery.length < 2) { setResults([]); return }
    let cancelled = false
    setSearching(true)
    searchUsers(debouncedQuery, currentUserId)
      .then((found) => { if (!cancelled) setResults(found) })
      .catch(() => { if (!cancelled) setResults([]) })
      .finally(() => { if (!cancelled) setSearching(false) })
    return () => { cancelled = true }
  }, [debouncedQuery, currentUserId])

  const handleSearch = useCallback((q: string) => {
    setQuery(q)
  }, [])

  const { data: relationships } = useRelationships(results.map((p) => p.id))

  function toggleSelect(profile: Profile) {
    setSelected((prev) =>
      prev.find((p) => p.id === profile.id) ? prev.filter((p) => p.id !== profile.id) : [...prev, profile],
    )
  }

  async function handleCreate() {
    if (selected.length === 0) return
    setLoading(true)
    setError(null)
    try {
      let id: string
      if (selected.length === 1) {
        id = await createDirectConversation(currentUserId, selected[0]!.id)
      } else {
        id = await createGroupConversation(currentUserId, selected.map((p) => p.id), groupName || 'Group')
      }
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
      onCreated(id)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text flex items-center gap-2">
            {selected.length > 1 ? <Users size={18} className="text-[#5b8def]" /> : <UserPlus size={18} className="text-[#5b8def]" />}
            {selected.length > 1 ? 'New Group' : 'New Conversation'}
          </h2>
          <button onClick={onClose} className="text-text-subtle hover:text-text transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map((p) => (
                <span key={p.id} className="flex items-center gap-1 bg-primary-tint text-[#5b8def] text-xs rounded-full px-2.5 py-1">
                  {p.display_name ?? p.username}
                  <button onClick={() => toggleSelect(p)} className="hover:text-[#4a7de4]">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {selected.length > 1 && (
            <>
              <input
                type="text"
                placeholder="Group name (optional)"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full px-3 py-2 bg-tint rounded-lg text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/40"
              />
              <p className="text-[11px] text-text-subtle">Groups can only include your friends.</p>
            </>
          )}

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
            <input
              type="text"
              placeholder="Search by username..."
              value={query}
              onChange={(e) => void handleSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-tint rounded-lg text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/40"
            />
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1">
            {searching && <p className="text-xs text-text-subtle text-center py-3">Searching...</p>}
            {!searching && results.length === 0 && query.length >= 2 && (
              <p className="text-xs text-text-subtle text-center py-3">No users found</p>
            )}
            {results.map((profile) => {
              const isSelected = !!selected.find((p) => p.id === profile.id)
              const isFriend = relationships?.get(profile.id)?.status === 'friends'
              return (
                <button
                  key={profile.id}
                  onClick={() => toggleSelect(profile)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isSelected ? 'bg-primary-tint' : 'hover:bg-tint'}`}
                >
                  <Avatar src={profile.avatar_url} alt={profile.display_name ?? profile.username} size={32} />
                  <div className="text-left min-w-0">
                    <p className="text-sm text-text font-medium truncate">{profile.display_name ?? profile.username}</p>
                    <p className="text-xs text-text-subtle truncate">
                      @{profile.username}
                      {!isFriend && <span className="text-text-faint"> · not a friend</span>}
                    </p>
                  </div>
                  {isSelected && <span className="ml-auto w-4 h-4 rounded-full bg-[#5b8def] flex-shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>

        {error && <p className="text-xs text-red-500 px-5 pb-2">{error}</p>}
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-text transition-colors">
            Cancel
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={selected.length === 0 || loading}
            className="px-4 py-2 text-sm font-medium bg-[#5b8def] hover:bg-[#4a7de4] text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating...' : selected.length > 1 ? 'Create Group' : 'Start Chat'}
          </button>
        </div>
      </div>
    </div>
  )
}
