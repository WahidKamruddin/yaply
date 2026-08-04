import type { Profile } from '@/features/chat/types'

/**
 * How the signed-in user relates to some other user. Resolved server-side by
 * the `get_relationships` RPC so search results, member lists and profile views
 * can never disagree about the same pair.
 *
 * `blocked`    — I blocked them.
 * `blocked_by` — they blocked me (the UI must not reveal this; it renders the
 *                same as `none` and lets the send fail server-side).
 */
export type RelationshipStatus =
  | 'none'
  | 'pending_out'
  | 'pending_in'
  | 'friends'
  | 'blocked'
  | 'blocked_by'

export interface Relationship {
  userId: string
  status: RelationshipStatus
  /** friendships.id — needed to accept an incoming request straight from a list. */
  requestId: string | null
  mutualFriends: number
}

/** An accepted friendship, flattened to "the other person". */
export interface Friend {
  friendshipId: string
  profile: Profile
  since: string
}

/** A pending friendship, in either direction. */
export interface FriendRequest {
  id: string
  profile: Profile
  direction: 'incoming' | 'outgoing'
  createdAt: string
}

export interface FriendSuggestion {
  profile: Profile
  mutualFriends: number
  sharedGroups: number
}

export interface BlockedUser {
  profile: Profile
  blockedAt: string
}

/** Per-member message-request state on conversation_members. */
export type RequestState = 'accepted' | 'pending' | 'declined'
