import type { QueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { inFilter } from '@/lib/realtimeFilters'
import { markDelivered } from '../api/conversations'
import type { ConversationListItem, Profile } from '../types'

/**
 * One realtime channel set per signed-in user for the conversation list,
 * shared by every component that mounts `useConversations` (the sidebar,
 * ChatView, the chat route, the command palette, the friends shared-context
 * hook…). Each mount used to open its own randomly named channel, so every
 * event was delivered — and every refetch requested — once per mount.
 *
 * Ref-counted: the first `acquire` for a userId creates the entry, the last
 * `release` tears the channel down. A userId change or sign-out is just a
 * release of the old id (and an acquire of the new one, if any).
 */

/** Trailing window that coalesces a burst of list-invalidating events into one refetch. */
export const CONVERSATIONS_INVALIDATE_DEBOUNCE_MS = 300

interface Entry {
  refs: number
  queryClient: QueryClient
  channel: RealtimeChannel | null
  conversationKey: string
  memberKey: string
  hasSubscribed: boolean
  deliveredUpTo: string | null
  deliveredTimer: ReturnType<typeof setTimeout> | null
}

const registry = new Map<string, Entry>()

// ── Coalesced invalidation ────────────────────────────────────────────────
// One trailing timer per QueryClient for the whole ['conversations'] prefix,
// shared with useRealtimeMessages so the list channel and the active
// conversation's channel hearing the same insert still produce one refetch.
// Every re-run of fetchConversations re-fetches envelopes and re-does ECDH for
// every v2 preview, so this is the expensive path worth collapsing.
const invalidateTimers = new WeakMap<QueryClient, ReturnType<typeof setTimeout>>()

export function scheduleConversationsInvalidate(queryClient: QueryClient): void {
  const pending = invalidateTimers.get(queryClient)
  if (pending) clearTimeout(pending)
  invalidateTimers.set(
    queryClient,
    setTimeout(() => {
      invalidateTimers.delete(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }, CONVERSATIONS_INVALIDATE_DEBOUNCE_MS),
  )
}

// ── Presence / public profile patching ────────────────────────────────────
// profiles UPDATEs are applied to the cached list in place — never a refetch.
// Only the public fields already present in the list's Profile shape are
// copied, and only when the payload actually carries them with the right type.
type PublicProfilePatch = Partial<Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'is_online' | 'last_seen_at'>>

function pickPublicProfileFields(row: Record<string, unknown>): PublicProfilePatch {
  const patch: PublicProfilePatch = {}
  if (typeof row.is_online === 'boolean') patch.is_online = row.is_online
  if (typeof row.last_seen_at === 'string' || row.last_seen_at === null) patch.last_seen_at = row.last_seen_at
  if (typeof row.username === 'string') patch.username = row.username
  if (typeof row.display_name === 'string' || row.display_name === null) patch.display_name = row.display_name
  if (typeof row.avatar_url === 'string' || row.avatar_url === null) patch.avatar_url = row.avatar_url
  return patch
}

function patchProfileInCache(queryClient: QueryClient, userId: string, row: Record<string, unknown>): void {
  const profileId = typeof row.id === 'string' ? row.id : null
  if (!profileId) return
  const patch = pickPublicProfileFields(row)
  const fields = Object.keys(patch) as (keyof PublicProfilePatch)[]
  if (fields.length === 0) return

  queryClient.setQueryData<ConversationListItem[]>(['conversations', userId], (old) => {
    if (!old) return old
    const needsPatch = (m: ConversationListItem['members'][number]) =>
      m.userId === profileId && fields.some((f) => m.profile[f] !== patch[f])
    // Unknown profile, or nothing actually changed → keep the same reference
    // so no observer re-renders.
    if (!old.some((c) => c.members.some(needsPatch))) return old
    return old.map((c) =>
      c.members.some(needsPatch)
        ? {
            ...c,
            members: c.members.map((m) => (needsPatch(m) ? { ...m, profile: { ...m.profile, ...patch } } : m)),
          }
        : c,
    )
  })
}

// ── Channel lifecycle ─────────────────────────────────────────────────────
function buildChannel(userId: string, entry: Entry): void {
  if (entry.channel) void supabase.removeChannel(entry.channel)

  const { queryClient } = entry
  const conversationIds = entry.conversationKey ? entry.conversationKey.split(',') : []
  const memberIds = entry.memberKey ? entry.memberKey.split(',') : []
  const invalidate = () => scheduleConversationsInvalidate(queryClient)

  // A fresh topic per rebuild: the dying channel may still hold the old topic
  // while removeChannel completes.
  const channel = supabase.channel(`conversation-list:${userId}:${Date.now()}`)

  // New message in one of my conversations → preview, order and unread change.
  // Invalidation only: the payload is ciphertext and is never read.
  if (conversationIds.length > 0) {
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: inFilter('conversation_id', conversationIds) },
      invalidate,
    )
  }

  // Presence heartbeats and public profile edits are patched in place.
  if (memberIds.length > 0) {
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: inFilter('id', memberIds) },
      (payload) => {
        if (entry.channel !== channel) return
        patchProfileInCache(queryClient, userId, payload.new)
      },
    )
  }

  // Joining a conversation (a new DM, a group add) changes the id sets above;
  // the refetch changes the keys, which rebuilds this channel.
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${userId}` },
    invalidate,
  )

  channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED' || entry.channel !== channel) return
    // A rebuild only hears events from now on — catch up on anything that
    // landed between tearing the old channel down and this join.
    if (entry.hasSubscribed) invalidate()
    entry.hasSubscribed = true
  })

  entry.channel = channel
}

export function acquireConversationListChannel(userId: string, queryClient: QueryClient): () => void {
  let entry = registry.get(userId)
  if (!entry) {
    entry = {
      refs: 0,
      queryClient,
      channel: null,
      conversationKey: '',
      memberKey: '',
      hasSubscribed: false,
      deliveredUpTo: null,
      deliveredTimer: null,
    }
    registry.set(userId, entry)
  }
  entry.refs += 1
  const owned = entry

  let released = false
  return () => {
    if (released) return
    released = true
    owned.refs -= 1
    if (owned.refs > 0) return
    if (owned.deliveredTimer) clearTimeout(owned.deliveredTimer)
    if (owned.channel) void supabase.removeChannel(owned.channel)
    owned.channel = null
    if (registry.get(userId) === owned) registry.delete(userId)
  }
}

/**
 * Called by every mounted hook with the keys derived from the (shared) query
 * data. The first caller with new keys rebuilds the channel; the rest no-op.
 */
export function syncConversationListChannel(userId: string, conversationKey: string, memberKey: string): void {
  const entry = registry.get(userId)
  if (!entry) return
  if (entry.channel && entry.conversationKey === conversationKey && entry.memberKey === memberKey) return
  entry.conversationKey = conversationKey
  entry.memberKey = memberKey
  buildChannel(userId, entry)
}

/**
 * Delivery watermark: this client now holds everything up to `newest`.
 * Debounced and de-duplicated per user so N mounted hooks send one write.
 */
export function noteDeliveredUpTo(userId: string, newest: string): void {
  const entry = registry.get(userId)
  if (!entry) return
  if (entry.deliveredUpTo && newest <= entry.deliveredUpTo) return
  if (entry.deliveredTimer) clearTimeout(entry.deliveredTimer)
  entry.deliveredTimer = setTimeout(() => {
    entry.deliveredTimer = null
    if (entry.deliveredUpTo && newest <= entry.deliveredUpTo) return
    markDelivered(newest)
      .then(() => {
        if (!entry.deliveredUpTo || newest > entry.deliveredUpTo) entry.deliveredUpTo = newest
      })
      .catch((err: unknown) => { console.error('[yaply] failed to mark delivered', err) })
  }, 500)
}
