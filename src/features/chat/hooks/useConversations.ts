import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchConversations } from '../api/conversations'
import {
  acquireConversationListChannel,
  noteDeliveredUpTo,
  syncConversationListChannel,
} from '../lib/conversationListRealtime'

export function useConversations(userId: string | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['conversations', userId],
    queryFn: () => fetchConversations(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  })

  // One shared, ref-counted channel set per user however many components mount
  // this hook (see conversationListRealtime.ts). Declared before the sync
  // effect so the registry entry exists by the time keys are pushed to it.
  useEffect(() => {
    if (!userId) return
    return acquireConversationListChannel(userId, queryClient)
  }, [userId, queryClient])

  // Delivery watermark: this client now holds everything up to the newest
  // message it just fetched. Every realtime insert refetches the list, so this
  // also covers live arrivals. Debounced and de-duplicated in the registry.
  useEffect(() => {
    if (!userId || !query.data) return
    const newest = query.data.reduce<string | null>((max, c) => {
      const at = c.lastMessage?.createdAt
      return at && (!max || at > max) ? at : max
    }, null)
    if (newest) noteDeliveredUpTo(userId, newest)
  }, [userId, query.data])

  // The channel only hears this user's own conversations and their members.
  // A sorted, joined key keeps the channel from being rebuilt on every refetch.
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
    syncConversationListChannel(userId, conversationKey, memberKey)
  }, [userId, query.isSuccess, conversationKey, memberKey])

  return query
}
