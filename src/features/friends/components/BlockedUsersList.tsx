import { useState } from 'react'
import { ShieldOff } from 'lucide-react'
import { useBlockedUsers, useUnblockUser } from '../hooks/useFriends'
import UserRow from './UserRow'

interface Props {
  currentUserId: string
}

export default function BlockedUsersList({ currentUserId }: Props) {
  const { data: blocked = [], isLoading, isError } = useBlockedUsers(currentUserId)
  const unblock = useUnblockUser(currentUserId)
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <p className="text-xs text-text-subtle py-6 text-center">Loading…</p>
  if (isError) return <p className="text-sm text-danger py-6 text-center">Failed to load blocked users</p>

  if (blocked.length === 0) {
    return (
      <div className="py-16 text-center">
        <ShieldOff size={26} strokeWidth={1.5} className="mx-auto text-text-subtle mb-2" />
        <p className="text-sm text-text-muted">You haven't blocked anyone.</p>
      </div>
    )
  }

  return (
    <>
      {error && <p className="text-xs text-red-500 px-3 pb-2">{error}</p>}
      <div className="space-y-0.5">
        {blocked.map((entry) => (
          <UserRow
            key={entry.profile.id}
            profile={entry.profile}
            actions={
              <button
                onClick={() =>
                  unblock.mutate(entry.profile.id, {
                    onError: () => setError('Something went wrong. Please try again.'),
                  })
                }
                disabled={unblock.isPending}
                className="px-3 py-2 rounded-lg border border-border text-text-muted hover:bg-tint text-xs font-medium transition-colors disabled:opacity-50"
              >
                Unblock
              </button>
            }
          />
        ))}
      </div>
    </>
  )
}
