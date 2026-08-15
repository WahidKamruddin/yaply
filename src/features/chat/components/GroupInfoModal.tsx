import { useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { X, UserPlus, Trash2, Search, Crown, ShieldCheck, AlertTriangle } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQueryClient } from '@tanstack/react-query'
import { addGroupMember, removeGroupMember, promoteMemberToAdmin, deleteGroupForEveryone } from '@/features/chat/api/conversations'
import { useFriends } from '@/features/friends/hooks/useFriends'
import Avatar from '@/components/Avatar'
import type { ConversationListItem, Profile } from '@/features/chat/types'

interface Props {
  conversation: ConversationListItem
  currentUserId: string
  onClose: () => void
  onDeleted?: () => void
}

export default function GroupInfoModal({ conversation, currentUserId, onClose, onDeleted }: Props) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [promoting, setPromoting] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null)
  const [confirmPromote, setConfirmPromote] = useState<{ id: string; name: string } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const currentMember = conversation.members.find((m) => m.userId === currentUserId)
  const isAdminOrOwner = currentMember?.isAdmin ?? false

  // Only friends can be added to a group (enforced by the add_group_member RPC),
  // so the picker searches the friends list rather than every user — offering
  // someone who would then be rejected is worse than not offering them.
  const { data: friends = [] } = useFriends(currentUserId)

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q)
    const term = q.trim().toLowerCase()
    const memberIds = new Set(conversation.members.map((m) => m.userId))
    const candidates = friends
      .map((f) => f.profile)
      .filter((p) => !memberIds.has(p.id))
      .filter(
        (p) =>
          !term ||
          p.username.toLowerCase().includes(term) ||
          (p.display_name ?? '').toLowerCase().includes(term),
      )
    setSearchResults(candidates.slice(0, 20))
  }, [friends, conversation.members])

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['conversations'] })

  const handleAdd = useCallback(async (user: Profile) => {
    setAdding(user.id)
    try {
      await addGroupMember(conversation.id, user.id)
      refresh()
      setSearchQuery('')
      setSearchResults([])
      setShowSearch(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add member')
    }
    setAdding(null)
  }, [conversation.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemove = useCallback(async (userId: string) => {
    setRemoving(userId)
    setConfirmRemove(null)
    try {
      await removeGroupMember(conversation.id, userId)
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove member')
    }
    setRemoving(null)
  }, [conversation.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePromote = useCallback(async (userId: string) => {
    setPromoting(userId)
    setConfirmPromote(null)
    try {
      await promoteMemberToAdmin(conversation.id, userId)
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to promote member')
    }
    setPromoting(null)
  }, [conversation.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteForEveryone = useCallback(async () => {
    setDeleting(true)
    try {
      await deleteGroupForEveryone(conversation.id)
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      onClose()
      onDeleted?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete group')
    }
    setDeleting(false)
  }, [conversation.id, queryClient, onClose, onDeleted])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text">Group info</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-tint transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Group identity */}
        <div className="flex flex-col items-center gap-2 pt-5 pb-4 border-b border-border">
          <div className="w-14 h-14 rounded-full bg-[#5b8def] flex items-center justify-center text-white text-xl font-semibold">
            {(conversation.name ?? 'G').charAt(0).toUpperCase()}
          </div>
          <p className="text-sm font-semibold text-text">{conversation.name ?? 'Group'}</p>
          <p className="text-xs text-text-subtle">{conversation.members.length} members</p>
        </div>

        {/* Member list */}
        <div className="max-h-60 overflow-y-auto px-3 py-2">
          {conversation.members.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-tint">
              <button
                onClick={() => {
                  onClose()
                  void navigate({ to: '/profile/$username', params: { username: m.profile.username } })
                }}
                disabled={m.userId === currentUserId}
                className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:cursor-default"
              >
                <Avatar
                  src={m.profile.avatar_url}
                  alt={m.profile.display_name ?? m.profile.username}
                  size={32}
                  online={m.profile.is_online}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text truncate">
                    {m.profile.display_name ?? m.profile.username}
                    {m.userId === currentUserId && (
                      <span className="text-text-subtle font-normal"> (you)</span>
                    )}
                  </p>
                </div>
              </button>
              {m.isAdmin && (
                <Crown size={11} className="text-[#5b8def] flex-shrink-0" />
              )}
              {isAdminOrOwner && m.userId !== currentUserId && !m.isAdmin && (
                <button
                  onClick={() => setConfirmPromote({ id: m.userId, name: m.profile.display_name ?? m.profile.username })}
                  disabled={promoting === m.userId}
                  title="Make admin"
                  className="w-6 h-6 flex items-center justify-center rounded-full text-text-subtle hover:text-[#5b8def] hover:bg-tint transition-colors disabled:opacity-40"
                >
                  {promoting === m.userId ? <span className="w-3 h-3 border border-[#5b8def] border-t-transparent rounded-full animate-spin" /> : <ShieldCheck size={12} />}
                </button>
              )}
              {isAdminOrOwner && m.userId !== currentUserId && (
                <button
                  onClick={() => setConfirmRemove({ id: m.userId, name: m.profile.display_name ?? m.profile.username })}
                  disabled={removing === m.userId}
                  className="w-6 h-6 flex items-center justify-center rounded-full text-text-subtle hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  {removing === m.userId ? <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={12} />}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add member */}
        {isAdminOrOwner && (
          <div className="border-t border-border px-4 py-3">
            {!showSearch ? (
              <button
                onClick={() => { setShowSearch(true); handleSearch('') }}
                className="flex items-center gap-2 text-sm text-[#5b8def] font-medium hover:text-[#4a7de4] transition-colors"
              >
                <UserPlus size={14} />
                Add member
              </button>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search your friends…"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-tint rounded-lg text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/40"
                  />
                </div>
                {searchResults.length === 0 && (
                  <p className="text-xs text-text-subtle text-center py-3">
                    {friends.length === 0 ? 'Add some friends first.' : 'No friends to add'}
                  </p>
                )}
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => void handleAdd(u)}
                    disabled={adding === u.id}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-tint text-left disabled:opacity-40 transition-colors"
                  >
                    <Avatar src={u.avatar_url} alt={u.display_name ?? u.username} size={28} />
                    <span className="text-xs font-medium text-text">{u.display_name ?? u.username}</span>
                    <span className="text-xs text-text-subtle ml-auto">@{u.username}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Delete group for everyone — admin only */}
        {isAdminOrOwner && (
          <div className="border-t border-border px-4 py-3">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 text-sm text-red-400 font-medium hover:text-red-500 transition-colors"
            >
              <AlertTriangle size={14} />
              Delete group for everyone
            </button>
          </div>
        )}
      </div>

      {/* Action error */}
      <Dialog.Root open={!!actionError} onOpenChange={(open) => { if (!open) setActionError(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-full max-w-sm bg-card rounded-2xl shadow-xl border border-border p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={22} className="text-red-400" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-text">Something went wrong</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-text-subtle">{actionError}</Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="w-full px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-text-muted hover:bg-tint transition-colors">
                  OK
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Promote confirmation dialog */}
      <Dialog.Root open={!!confirmPromote} onOpenChange={(open) => { if (!open) setConfirmPromote(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-full max-w-sm bg-card rounded-2xl shadow-xl border border-border p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-tint flex items-center justify-center">
                <ShieldCheck size={22} className="text-[#5b8def]" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-text">Make {confirmPromote?.name} an admin?</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-text-subtle">
                  They'll be able to add/remove members, delete any item, and delete the group.
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-text-muted hover:bg-tint transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => confirmPromote && void handlePromote(confirmPromote.id)}
                  disabled={!!promoting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#5b8def] hover:bg-[#4a7de4] text-sm font-medium text-white transition-colors disabled:opacity-50"
                >
                  Make Admin
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Remove member confirmation dialog */}
      <Dialog.Root open={!!confirmRemove} onOpenChange={(open) => { if (!open) setConfirmRemove(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-full max-w-sm bg-card rounded-2xl shadow-xl border border-border p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 size={22} className="text-red-400" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-text">Remove {confirmRemove?.name}?</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-text-subtle">
                  They'll lose access to this group and all its messages.
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-text-muted hover:bg-tint transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => confirmRemove && void handleRemove(confirmRemove.id)}
                  disabled={!!removing}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-medium text-white transition-colors disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete confirmation dialog */}
      <Dialog.Root open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-full max-w-sm bg-card rounded-2xl shadow-xl border border-border p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={22} className="text-red-400" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-text">Delete group for everyone?</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-text-subtle">
                  This will permanently delete "{conversation.name ?? 'Group'}" and all messages for every member. This cannot be undone.
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-text-muted hover:bg-tint transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => void handleDeleteForEveryone()}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-medium text-white transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete for Everyone'}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
