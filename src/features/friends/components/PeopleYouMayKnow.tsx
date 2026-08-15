import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useFriendSuggestions, useRelationships } from '../hooks/useFriends'
import UserRow from './UserRow'
import FriendActionButton from './FriendActionButton'

interface Props {
  currentUserId: string
  onOpenProfile: (username: string) => void
}

export default function PeopleYouMayKnow({ currentUserId, onOpenProfile }: Props) {
  const { data: suggestions = [], isLoading, isError } = useFriendSuggestions(currentUserId)
  // Dismissals are intentionally session-only: there is no dismissed-suggestions
  // table, and inventing one for v1 would outlive its usefulness.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const visible = suggestions.filter((s) => !dismissed.has(s.profile.id))
  const { data: relationships } = useRelationships(visible.map((s) => s.profile.id))

  if (isLoading) return <p className="text-xs text-text-subtle py-6 text-center">Loading…</p>
  if (isError) return <p className="text-sm text-danger py-6 text-center">Failed to load suggestions</p>

  if (visible.length === 0) {
    return (
      <div className="py-16 text-center">
        <Sparkles size={26} strokeWidth={1.5} className="mx-auto text-text-subtle mb-2" />
        <p className="text-sm text-text-muted">No suggestions yet.</p>
        <p className="text-xs text-text-subtle mt-1">
          Add a few friends and we'll find people you both know.
        </p>
      </div>
    )
  }

  return (
    <>
      {error && <p className="text-xs text-red-500 px-3 pb-2">{error}</p>}
      <div className="space-y-0.5">
        {visible.map((suggestion) => {
          const signals: string[] = []
          if (suggestion.mutualFriends > 0) {
            signals.push(
              `${suggestion.mutualFriends} mutual friend${suggestion.mutualFriends === 1 ? '' : 's'}`,
            )
          }
          if (suggestion.sharedGroups > 0) {
            signals.push(
              `${suggestion.sharedGroups} shared group${suggestion.sharedGroups === 1 ? '' : 's'}`,
            )
          }

          return (
            <UserRow
              key={suggestion.profile.id}
              profile={suggestion.profile}
              subtitle={
                <>
                  @{suggestion.profile.username}
                  {signals.length > 0 && <span className="text-text-faint"> · {signals.join(' · ')}</span>}
                </>
              }
              onClick={() => onOpenProfile(suggestion.profile.username)}
              actions={
                <>
                  <FriendActionButton
                    userId={suggestion.profile.id}
                    relationship={relationships?.get(suggestion.profile.id)}
                    onError={setError}
                  />
                  <button
                    onClick={() =>
                      setDismissed((prev) => new Set(prev).add(suggestion.profile.id))
                    }
                    aria-label="Dismiss suggestion"
                    className="w-8 h-8 flex items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-tint transition-colors"
                  >
                    <X size={15} />
                  </button>
                </>
              }
            />
          )
        })}
      </div>
    </>
  )
}
