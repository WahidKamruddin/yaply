import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchConversations } from '../api/conversations'
import { inFilter } from '@/lib/realtimeFilters'
import type { ConversationListItem } from '../types'

export function useConversations(userId: string | undefined) {
  const queryClient = useQueryClient()
  // Each hook instance gets its own channel name to avoid the "cannot add callbacks
  // after subscribe()" error when useConversations is mounted more than once.
  const channelRef = useRef(`conversation-list-${Math.random().toString(36).slice(2)}`)
  const hasSubscribedRef = useRef(false)

  const query = useQuery({
    queryKey: ['conversations', userId],
    queryFn: () => fetchConversations(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  })

  // The channel only hears this user's own conversations and their members.
  // Both subscriptions used to be unfiltered: every message insert and every
  // presence write in the database reached every client, each authorised per
  // subscriber server-side, and each one refetched the whole list. A sorted,
  // joined key keeps the effect from resubscribing on every refetch.
  const conversationKey = useMemo(
    () => (query.data ?? []).map((c) => c.id).sort().join(','),
    [query.data],
  )
  const memberKey = useMemo(
    () =>
      [...new Set((query.data ?? []).flatMap((c) => c.members.map((m) => m.userId)))]
        .filter((id) => id !== userId)
        .sort()
        .join(','),
    [query.data, userId],
  )

  useEffect(() => {
    if (!userId || !query.isSuccess) return
    const conversationIds = conversationKey ? conversationKey.split(',') : []
    const memberIds = memberKey ? memberKey.split(',') : []
    const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['conversations', userId] })

    // A fresh topic per rebuild: the dying channel of the previous run may still
    // hold the old topic while removeChannel completes.
    const channel = supabase.channel(`${channelRef.current}-${Date.now()}`)

    // New message in one of my conversations → preview, order and unread change.
    if (conversationIds.length > 0) {
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: inFilter('conversation_id', conversationIds) },
        invalidate,
      )
    }

    // Presence heartbeats are patched into the cache in place; only a name,
    // username or avatar change (rare) is worth a refetch.
    if (memberIds.length > 0) {
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: inFilter('id', memberIds) },
        (payload) => {
          const row = payload.new as {
            id: string; username: string; display_name: string | null; avatar_url: string | null
            is_online: boolean; last_seen_at: string | null
          }
          const key = ['conversations', userId]
          const identityChanged = (queryClient.getQueryData<ConversationListItem[]>(key) ?? []).some((c) =>
            c.members.some(
              (m) =>
                m.userId === row.id &&
                (m.profile.username !== row.username ||
                  m.profile.display_name !== row.display_name ||
                  m.profile.avatar_url !== row.avatar_url),
            ),
          )
          queryClient.setQueryData<ConversationListItem[]>(key, (old) =>
            old?.map((c) => ({
              ...c,
              members: c.members.map((m) =>
                m.userId === row.id
                  ? { ...m, profile: { ...m.profile, is_online: row.is_online, last_seen_at: row.last_seen_at } }
                  : m,
              ),
            })),
          )
          if (identityChanged) invalidate()
        },
      )
    }

    // Joining a conversation (a new DM, a group add) changes the set above;
    // the refetch changes the keys, which rebuilds this channel.
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${userId}` },
      invalidate,
    )

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      // A rebuild only hears events from now on — catch up on anything that
      // landed between tearing the old channel down and this join.
      if (hasSubscribedRef.current) invalidate()
      hasSubscribedRef.current = true
    })
    return () => { void supabase.removeChannel(channel) }
  }, [userId, query.isSuccess, conversationKey, memberKey, queryClient])

  return query
}
