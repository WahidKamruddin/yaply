import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SearchX } from 'lucide-react'
import { searchUsers } from '@/features/chat/api/conversations'
import { useRelationships } from '../hooks/useFriends'
import UserRow from './UserRow'
import FriendActionButton from './FriendActionButton'

interface Props {
  query: string
  currentUserId: string
  onOpenProfile: (userId: string) => void
}

/**
 * Results for the "Search people by name or username" field. Blocked users in
 * either direction are filtered out server-side by the search_users RPC, so
 * there is nothing to hide here.
 */
export default function PeopleSearchResults({ query, currentUserId, onOpenProfile }: Props) {
  const [error, setError] = useState<string | null>(null)

  const { data: results = [], isLoading, isError } = useQuery({
    queryKey: ['people-search', query],
    queryFn: () => searchUsers(query, currentUserId),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  })

  const { data: relationships } = useRelationships(results.map((p) => p.id))

  if (isLoading) return <p className="text-xs text-text-subtle py-6 text-center">Searching…</p>
  if (isError) return <p className="text-sm text-danger py-6 text-center">Search failed</p>

  if (results.length === 0) {
    return (
      <div className="py-16 text-center">
        <SearchX size={26} strokeWidth={1.5} className="mx-auto text-text-subtle mb-2" />
        <p className="text-sm text-text-muted">No one found for “{query}”.</p>
      </div>
    )
  }

  return (
    <>
      {error && <p className="text-xs text-red-500 px-3 pb-2">{error}</p>}
      <div className="space-y-0.5">
        {results.map((profile) => {
          const relationship = relationships?.get(profile.id)
          return (
            <UserRow
              key={profile.id}
              profile={profile}
              showPresence
              subtitle={
                <>
                  @{profile.username}
                  {relationship && relationship.mutualFriends > 0 && (
                    <span className="text-text-faint">
                      {' '}· {relationship.mutualFriends} mutual friend
                      {relationship.mutualFriends === 1 ? '' : 's'}
                    </span>
                  )}
                </>
              }
              onClick={() => onOpenProfile(profile.id)}
              actions={
                <FriendActionButton
                  userId={profile.id}
                  relationship={relationship}
                  onError={setError}
                />
              }
            />
          )
        })}
      </div>
    </>
  )
}
