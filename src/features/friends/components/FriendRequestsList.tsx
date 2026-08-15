import { useState } from 'react'
import { Check, Inbox, Send, X } from 'lucide-react'
import {
  useAcceptFriendRequest,
  useFriendRequests,
  useRelationships,
  useRemoveFriendship,
} from '../hooks/useFriends'
import UserRow from './UserRow'
import type { FriendRequest } from '../types'

interface Props {
  currentUserId: string
  direction: 'incoming' | 'outgoing'
  onOpenProfile: (username: string) => void
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function FriendRequestsList({ currentUserId, direction, onOpenProfile }: Props) {
  const { incoming, outgoing, isLoading, isError } = useFriendRequests(currentUserId)
  const acceptRequest = useAcceptFriendRequest()
  const removeFriendship = useRemoveFriendship()
  const [error, setError] = useState<string | null>(null)

  const requests: FriendRequest[] = direction === 'incoming' ? incoming : outgoing

  // Mutual-friend counts come from the same batched RPC the rest of the app uses.
  const { data: relationships } = useRelationships(requests.map((r) => r.profile.id))

  if (isLoading) return <p className="text-xs text-text-subtle py-6 text-center">Loading…</p>
  if (isError) return <p className="text-sm text-danger py-6 text-center">Failed to load requests</p>

  if (requests.length === 0) {
    return (
      <div className="py-16 text-center">
        {direction === 'incoming' ? (
          <Inbox size={26} strokeWidth={1.5} className="mx-auto text-text-subtle mb-2" />
        ) : (
          <Send size={26} strokeWidth={1.5} className="mx-auto text-text-subtle mb-2" />
        )}
        <p className="text-sm text-text-muted">
          {direction === 'incoming' ? 'No friend requests right now.' : "You haven't sent any requests."}
        </p>
      </div>
    )
  }

  function fail() {
    setError('Something went wrong. Please try again.')
  }

  return (
    <>
      {error && <p className="text-xs text-red-500 px-3 pb-2">{error}</p>}
      <div className="space-y-0.5">
        {requests.map((request) => {
          const mutual = relationships?.get(request.profile.id)?.mutualFriends ?? 0
          const subtitle = (
            <>
              @{request.profile.username}
              <span className="text-text-faint"> · {relativeDate(request.createdAt)}</span>
              {mutual > 0 && (
                <span className="text-text-faint">
                  {' '}· {mutual} mutual friend{mutual === 1 ? '' : 's'}
                </span>
              )}
            </>
          )

          return (
            <UserRow
              key={request.id}
              profile={request.profile}
              subtitle={subtitle}
              onClick={() => onOpenProfile(request.profile.username)}
              actions={
                direction === 'incoming' ? (
                  <>
                    <button
                      onClick={() =>
                        acceptRequest.mutate(request.id, { onError: fail })
                      }
                      disabled={acceptRequest.isPending}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#5b8def] hover:bg-[#4a7de4] text-white text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      <Check size={13} />
                      Accept
                    </button>
                    <button
                      onClick={() =>
                        removeFriendship.mutate(request.id, { onError: fail })
                      }
                      disabled={removeFriendship.isPending}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-text-muted hover:bg-tint text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      <X size={13} />
                      Decline
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => removeFriendship.mutate(request.id, { onError: fail })}
                    disabled={removeFriendship.isPending}
                    className="px-3 py-2 rounded-lg border border-border text-text-muted hover:bg-tint text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    Cancel Request
                  </button>
                )
              }
            />
          )
        })}
      </div>
    </>
  )
}
