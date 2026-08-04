import { useState } from 'react'
import { Check, Clock, UserPlus } from 'lucide-react'
import { useAcceptFriendRequest, useSendFriendRequest } from '../hooks/useFriends'
import type { Relationship } from '../types'

interface Props {
  userId: string
  relationship: Relationship | undefined
  /** Compact height for dense lists (search results, member lists). */
  compact?: boolean
  onError?: (message: string) => void
}

const BASE =
  'flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors disabled:cursor-not-allowed'

/**
 * The one place the "what can I do with this person" decision is made, so the
 * button never disagrees with itself between search results, the friends page
 * and a profile.
 *
 * The optimistic flip is deliberately local state rather than React Query cache
 * surgery: the codebase has no onMutate anywhere, and one button is a poor
 * reason to introduce rollback semantics. On failure it reverts and reports the
 * error upward.
 */
export default function FriendActionButton({ userId, relationship, compact = false, onError }: Props) {
  const [optimistic, setOptimistic] = useState<'sent' | 'accepted' | null>(null)
  const sendRequest = useSendFriendRequest()
  const acceptRequest = useAcceptFriendRequest()

  const status = optimistic === 'sent' ? 'pending_out'
    : optimistic === 'accepted' ? 'friends'
    : relationship?.status ?? 'none'

  const size = compact ? 'px-2.5 py-1.5' : 'px-3 py-2'

  function handleAdd() {
    setOptimistic('sent')
    sendRequest.mutate(userId, {
      onError: (err) => {
        setOptimistic(null)
        onError?.(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      },
    })
  }

  function handleAccept() {
    if (!relationship?.requestId) return
    setOptimistic('accepted')
    acceptRequest.mutate(relationship.requestId, {
      onError: (err) => {
        setOptimistic(null)
        onError?.(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      },
    })
  }

  // Someone who blocked us must look exactly like a stranger — revealing the
  // block is itself information. The send simply fails server-side.
  if (status === 'blocked') return null

  if (status === 'friends') {
    return (
      <span className={`${BASE} ${size} bg-tint text-text-muted`}>
        <Check size={13} />
        Friends
      </span>
    )
  }

  if (status === 'pending_out') {
    return (
      <span className={`${BASE} ${size} bg-tint text-text-subtle`}>
        <Clock size={13} />
        Requested
      </span>
    )
  }

  if (status === 'pending_in') {
    return (
      <button
        onClick={handleAccept}
        disabled={acceptRequest.isPending}
        className={`${BASE} ${size} bg-[#5b8def] hover:bg-[#4a7de4] text-white disabled:opacity-50`}
      >
        <Check size={13} />
        Accept
      </button>
    )
  }

  return (
    <button
      onClick={handleAdd}
      disabled={sendRequest.isPending}
      className={`${BASE} ${size} bg-primary-tint text-[#5b8def] hover:bg-primary-tint-strong disabled:opacity-50`}
    >
      <UserPlus size={13} />
      Add Friend
    </button>
  )
}
