import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { X, Bell, BellOff, Trash2, Ban, AlertTriangle } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQueryClient } from '@tanstack/react-query'
import { muteConversation, deleteConversation } from '@/features/chat/api/conversations'
import { blockUser } from '@/features/friends/api/friends'
import Avatar from '@/components/Avatar'
import type { ConversationListItem } from '@/features/chat/types'

interface Props {
  conversation: ConversationListItem
  currentUserId: string
  onClose: () => void
  onDeleted?: () => void
}

// "Mute forever" sentinel — the JS max Date, matching the ConversationItem
// swipe-menu convention. muted_until in the past / null = not muted.
const MUTE_FOREVER = () => new Date(8640000000000000)

export default function DmSettingsModal({ conversation, currentUserId, onClose, onDeleted }: Props) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const other = conversation.members.find((m) => m.userId !== currentUserId) ?? null
  const otherName = other?.profile.display_name ?? other?.profile.username ?? 'Deleted user'

  const [muted, setMuted] = useState(conversation.isMuted)
  const [muting, setMuting] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'block' | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const refreshConversations = () => void queryClient.invalidateQueries({ queryKey: ['conversations'] })

  const toggleMute = useCallback(async () => {
    const next = !muted
    setMuted(next)
    setMuting(true)
    try {
      await muteConversation(conversation.id, currentUserId, next ? MUTE_FOREVER() : null)
      refreshConversations()
    } catch (err) {
      setMuted(!next)
      setActionError(err instanceof Error ? err.message : 'Failed to update notifications')
    }
    setMuting(false)
  }, [muted, conversation.id, currentUserId])

  const handleDelete = useCallback(async () => {
    setBusy(true)
    try {
      await deleteConversation(conversation.id, currentUserId)
      refreshConversations()
      onClose()
      onDeleted?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete chat')
      setBusy(false)
      setConfirm(null)
    }
  }, [conversation.id, currentUserId, onClose, onDeleted])

  const handleBlock = useCallback(async () => {
    if (!other) return
    setBusy(true)
    try {
      await blockUser(other.userId)
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      void queryClient.invalidateQueries({ queryKey: ['relationships'] })
      onClose()
      onDeleted?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to block user')
      setBusy(false)
      setConfirm(null)
    }
  }, [other, queryClient, onClose, onDeleted])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text">Chat settings</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-tint transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* DM identity */}
        <div className="flex flex-col items-center gap-2 pt-5 pb-4 border-b border-border">
          <Avatar src={other?.profile.avatar_url} alt={otherName} size={56} online={other?.profile.is_online} />
          <p className="text-sm font-semibold text-text">{otherName}</p>
          <p className="text-xs text-text-subtle">Direct message</p>
        </div>

        {/* Members */}
        <div className="px-3 py-2 border-b border-border">
          <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">Members</p>
          {conversation.members.map((m) => (
            <button
              key={m.userId}
              onClick={() => {
                onClose()
                void navigate({ to: '/profile/$username', params: { username: m.profile.username } })
              }}
              disabled={m.userId === currentUserId}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-tint text-left disabled:cursor-default disabled:hover:bg-transparent"
            >
              <Avatar src={m.profile.avatar_url} alt={m.profile.display_name ?? m.profile.username} size={32} online={m.profile.is_online} />
              <p className="text-xs font-medium text-text truncate">
                {m.profile.display_name ?? m.profile.username}
                {m.userId === currentUserId && <span className="text-text-subtle font-normal"> (you)</span>}
              </p>
            </button>
          ))}
        </div>

        {/* Settings */}
        <div className="px-3 py-2">
          <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">Settings</p>

          <button
            onClick={() => void toggleMute()}
            disabled={muting}
            className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-tint transition-colors disabled:opacity-50"
          >
            {muted ? <BellOff size={15} className="text-text-subtle" /> : <Bell size={15} className="text-text-subtle" />}
            <span className="text-sm text-text flex-1 text-left">Mute notifications</span>
            <span className={`relative w-9 h-5 rounded-full transition-colors ${muted ? 'bg-[#5b8def]' : 'bg-border'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${muted ? 'left-4' : 'left-0.5'}`} />
            </span>
          </button>

          <button
            onClick={() => setConfirm('block')}
            className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-red-500/10 transition-colors"
          >
            <Ban size={15} className="text-red-500" />
            <span className="text-sm text-red-500 flex-1 text-left">Block user</span>
          </button>

          <button
            onClick={() => setConfirm('delete')}
            className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={15} className="text-red-500" />
            <span className="text-sm text-red-500 flex-1 text-left">Delete chat</span>
          </button>
        </div>
      </div>

      {/* Confirm dialog (delete / block) */}
      <Dialog.Root open={!!confirm} onOpenChange={(open) => { if (!open) setConfirm(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-full max-w-sm bg-card rounded-2xl shadow-xl border border-border p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                {confirm === 'block' ? <Ban size={22} className="text-red-500" /> : <Trash2 size={22} className="text-red-500" />}
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-text">
                  {confirm === 'block' ? `Block ${otherName}?` : 'Delete this chat?'}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-text-subtle">
                  {confirm === 'block'
                    ? "They won't be able to message you, and any friendship is removed. They aren't told."
                    : 'This removes the conversation from your list. If they have already left, it and its messages are deleted for good.'}
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-text-muted hover:bg-tint transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => (confirm === 'block' ? void handleBlock() : void handleDelete())}
                  disabled={busy}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-medium text-white transition-colors disabled:opacity-50"
                >
                  {busy ? 'Working…' : confirm === 'block' ? 'Block' : 'Delete'}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Action error */}
      <Dialog.Root open={!!actionError} onOpenChange={(open) => { if (!open) setActionError(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-full max-w-sm bg-card rounded-2xl shadow-xl border border-border p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
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
    </div>
  )
}
