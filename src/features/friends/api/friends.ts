import { supabase } from '@/lib/supabase'
import type { Profile } from '@/features/chat/types'
import type {
  BlockedUser,
  Friend,
  FriendRequest,
  FriendSuggestion,
  Relationship,
  RelationshipStatus,
} from '../types'

const PROFILE_COLUMNS = 'id, username, display_name, avatar_url, is_online, last_seen_at'

type FriendshipRow = {
  id: string
  requester_id: string
  recipient_id: string
  status: string
  created_at: string
  requester: Profile | null
  recipient: Profile | null
}

// One query covers friends, incoming requests and outgoing requests: the row is
// the same shape in all three cases, only status and direction differ. RLS
// already restricts this to rows the caller participates in.
async function fetchFriendshipRows(): Promise<FriendshipRow[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(
      `id, requester_id, recipient_id, status, created_at,
       requester:profiles!friendships_requester_id_fkey (${PROFILE_COLUMNS}),
       recipient:profiles!friendships_recipient_id_fkey (${PROFILE_COLUMNS})`,
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as unknown as FriendshipRow[]
}

export async function fetchFriends(userId: string): Promise<Friend[]> {
  const rows = await fetchFriendshipRows()
  return rows
    .filter((r) => r.status === 'accepted')
    .map((r) => {
      const profile = r.requester_id === userId ? r.recipient : r.requester
      return profile ? { friendshipId: r.id, profile, since: r.created_at } : null
    })
    .filter((f): f is Friend => f !== null)
}

export async function fetchFriendRequests(userId: string): Promise<FriendRequest[]> {
  const rows = await fetchFriendshipRows()
  return rows
    .filter((r) => r.status === 'pending')
    .map((r) => {
      const incoming = r.recipient_id === userId
      const profile = incoming ? r.requester : r.recipient
      return profile
        ? {
            id: r.id,
            profile,
            direction: incoming ? ('incoming' as const) : ('outgoing' as const),
            createdAt: r.created_at,
          }
        : null
    })
    .filter((r): r is FriendRequest => r !== null)
}

// Every mutation below that carries an invariant goes through an RPC — the
// friendships table has no INSERT/UPDATE policy at all, deliberately.
export async function sendFriendRequest(recipientId: string): Promise<void> {
  const { error } = await supabase.rpc('send_friend_request', { p_recipient_id: recipientId })
  if (error) throw error
}

export async function acceptFriendRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_friend_request', { p_request_id: requestId })
  if (error) throw error
}

/**
 * Decline, cancel and unfriend are all the same operation: delete the edge, so
 * the pair falls back to `none` and a future request is still possible. The
 * `.select()` is there because an RLS-blocked delete reports success with zero
 * rows touched, which would otherwise look like it worked.
 */
export async function removeFriendship(friendshipId: string): Promise<void> {
  const { data, error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .select('id')

  if (error) throw error
  if (data.length === 0) {
    console.error('[yaply] removeFriendship touched 0 rows', { friendshipId })
  }
}

export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_user_id: userId })
  if (error) throw error
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
  if (error) throw error
}

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase
    .from('user_blocks')
    .select(`created_at, blocked:profiles!user_blocks_blocked_id_fkey (${PROFILE_COLUMNS})`)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as unknown as Array<{ created_at: string; blocked: Profile | null }>)
    .map((r) => (r.blocked ? { profile: r.blocked, blockedAt: r.created_at } : null))
    .filter((b): b is BlockedUser => b !== null)
}

/**
 * Batched on purpose. Search results, group member lists and the friends page
 * each need the relationship for many users at once; a per-user call would be a
 * guaranteed N+1 against an RPC that already does the work set-at-a-time.
 */
export async function fetchRelationships(userIds: string[]): Promise<Map<string, Relationship>> {
  const map = new Map<string, Relationship>()
  if (userIds.length === 0) return map

  const { data, error } = await supabase.rpc('get_relationships', { p_user_ids: userIds })
  if (error) throw error

  for (const row of data) {
    map.set(row.user_id, {
      userId: row.user_id,
      status: row.status as RelationshipStatus,
      requestId: row.request_id,
      mutualFriends: row.mutual_friends,
    })
  }
  return map
}

export async function fetchFriendSuggestions(limit = 10): Promise<FriendSuggestion[]> {
  const { data, error } = await supabase.rpc('get_friend_suggestions', { p_limit: limit })
  if (error) throw error

  return data.map((row) => ({
    profile: {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      is_online: row.is_online,
      last_seen_at: null,
    },
    mutualFriends: row.mutual_friends,
    sharedGroups: row.shared_groups,
  }))
}

// ─── Message requests ─────────────────────────────────────────────────────────
// A member may only ever change their own row (the "self can update" policy), so
// these need no RPC. Declining must never delete the membership row —
// trg_delete_empty_conversation would take the conversation with it.

async function setRequestState(
  conversationId: string,
  userId: string,
  state: 'accepted' | 'declined',
): Promise<void> {
  const { data, error } = await supabase
    .from('conversation_members')
    .update({ request_state: state })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .select('user_id')

  if (error) throw error
  if (data.length === 0) {
    console.error('[yaply] setRequestState touched 0 rows', { conversationId, userId, state })
  }
}

export function acceptMessageRequest(conversationId: string, userId: string): Promise<void> {
  return setRequestState(conversationId, userId, 'accepted')
}

export function declineMessageRequest(conversationId: string, userId: string): Promise<void> {
  return setRequestState(conversationId, userId, 'declined')
}
