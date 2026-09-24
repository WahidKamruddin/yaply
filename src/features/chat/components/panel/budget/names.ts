import type { MemberSummary } from '../../../types'

/**
 * Name for a user in budget copy. "You" for the viewer; people who have since
 * left the chat keep their balances but aren't in `members`, so they fall back
 * to a neutral label rather than a raw id.
 */
export function makeNameOf(members: MemberSummary[], currentUserId: string) {
  const byId = new Map(members.map((m) => [m.userId, m.profile]))
  /** `object`: mid-sentence, so the viewer reads "you" ("Alice paid you"). */
  return (userId: string | null | undefined, opts: { object?: boolean } = {}): string => {
    if (!userId) return 'Someone'
    if (userId === currentUserId) return opts.object ? 'you' : 'You'
    const p = byId.get(userId)
    return p?.display_name || p?.username || 'Former member'
  }
}

export type NameOf = ReturnType<typeof makeNameOf>
