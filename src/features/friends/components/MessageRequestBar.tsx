import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSetAtom } from 'jotai'
import { Ban } from 'lucide-react'
import { activeConversationIdAtom } from '@/features/chat/store/chat.atoms'
import { acceptMessageRequest, declineMessageRequest } from '../api/friends'
import { useBlockUser } from '../hooks/useFriends'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  conversationId: string
  currentUserId: string
  senderName: string
  senderUserId: string | null
}

/**
 * Replaces the composer while a DM is still a message request. Accepting only
 * opens the thread — it does not make the two people friends, which is the whole
 * point of having message requests separate from friend requests.
 */
export default function MessageRequestBar({
  conversationId,
  currentUserId,
  senderName,
  senderUserId,
}: Props) {
  const queryClient = useQueryClient()
  const setActiveId = useSetAtom(activeConversationIdAtom)
  const blockUser = useBlockUser()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmBlock, setConfirmBlock] = useState(false)

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }

  async function handleAccept() {
    setBusy(true)
    setError(null)
    try {
      await acceptMessageRequest(conversationId, currentUserId)
      refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDecline() {
    setBusy(true)
    setError(null)
    try {
      await declineMessageRequest(conversationId, currentUserId)
      setActiveId(null)
      refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="px-4 pt-3 border-t border-border bg-surface"
      style={{ paddingBottom: `max(0.75rem, var(--safe-bottom))` }}
    >
      <p className="text-xs text-text-muted text-center">
        <span className="font-medium text-text">{senderName}</span> wants to send you a message.
      </p>
      <p className="text-[11px] text-text-subtle text-center mt-0.5">
        You can't reply until you accept this request.
      </p>

      {error && <p className="text-xs text-red-500 text-center mt-2">{error}</p>}

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => void handleDecline()}
          disabled={busy}
          className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-text-muted hover:bg-tint transition-colors disabled:opacity-50"
        >
          Decline
        </button>
        <button
          onClick={() => void handleAccept()}
          disabled={busy}
          className="flex-1 px-4 py-2.5 rounded-xl bg-[#5b8def] hover:bg-[#4a7de4] text-sm font-medium text-white transition-colors disabled:opacity-50"
        >
          Accept
        </button>
        <button
          onClick={() => setConfirmBlock(true)}
          disabled={busy || !senderUserId}
          title="Block"
          className="w-11 h-11 flex items-center justify-center rounded-xl border border-border text-text-subtle hover:text-danger hover:bg-danger-tint transition-colors disabled:opacity-50"
        >
          <Ban size={16} />
        </button>
      </div>

      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        Icon={Ban}
        title={`Block ${senderName}?`}
        description="They won't be able to message you or send you a friend request."
        confirmLabel="Block User"
        busy={blockUser.isPending}
        onConfirm={() => {
          if (!senderUserId) return
          blockUser.mutate(senderUserId, {
            onSuccess: () => {
              setConfirmBlock(false)
              setActiveId(null)
            },
            onError: () => {
              setConfirmBlock(false)
              setError('Something went wrong. Please try again.')
            },
          })
        }}
      />
    </div>
  )
}
