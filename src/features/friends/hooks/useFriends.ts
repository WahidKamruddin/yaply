import { useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  acceptFriendRequest,
  blockUser,
  fetchBlockedUsers,
  fetchFriendRequests,
  fetchFriendSuggestions,
  fetchFriends,
  fetchRelationships,
  removeFriendship,
  sendFriendRequest,
  unblockUser,
} from '../api/friends'

/**
 * Invalidate every friends-derived cache at once. Friend actions ripple further
 * than they look — accepting a request changes the friends list, the request
 * list, the badge, suggestions, the relationship of that user everywhere they
 * appear, and (via sync_direct_request_state) the conversation list.
 */
function invalidateFriendData(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['friends'] })
  void queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
  void queryClient.invalidateQueries({ queryKey: ['relationships'] })
  void queryClient.invalidateQueries({ queryKey: ['friend-suggestions'] })
  void queryClient.invalidateQueries({ queryKey: ['blocked-users'] })
  void queryClient.invalidateQueries({ queryKey: ['conversations'] })
}

export function useFriends(userId: string | undefined) {
  return useQuery({
    queryKey: ['friends', userId],
    queryFn: () => fetchFriends(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  })
}

/**
 * Incoming and outgoing requests, plus the pending count that drives the badge
 * in the sidebar. Subscribes to `friendships` so a request arriving in another
 * tab or from another device shows up without a refresh; as everywhere else in
 * the app the realtime payload is only an invalidation trigger, never parsed.
 */
export function useFriendRequests(userId: string | undefined) {
  const queryClient = useQueryClient()
  // Own channel name per mount — the sidebar and the friends page can both be
  // mounted at once, and Supabase rejects a second subscribe on one channel.
  const channelRef = useRef(`friendships-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(channelRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        invalidateFriendData(queryClient)
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, queryClient])

  const query = useQuery({
    queryKey: ['friend-requests', userId],
    queryFn: () => fetchFriendRequests(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  })

  const incoming = useMemo(
    () => (query.data ?? []).filter((r) => r.direction === 'incoming'),
    [query.data],
  )
  const outgoing = useMemo(
    () => (query.data ?? []).filter((r) => r.direction === 'outgoing'),
    [query.data],
  )

  return { ...query, incoming, outgoing, pendingCount: incoming.length }
}

/**
 * Relationship lookup for a set of users, resolved in one round trip. Pass every
 * user id a list is about to render rather than calling this per row.
 */
export function useRelationships(userIds: string[]) {
  // Sorted + joined so the key is stable regardless of the order the caller
  // happened to produce the ids in.
  const sorted = useMemo(() => [...new Set(userIds)].sort(), [userIds])

  return useQuery({
    queryKey: ['relationships', sorted.join(',')],
    queryFn: () => fetchRelationships(sorted),
    enabled: sorted.length > 0,
    staleTime: 30_000,
  })
}

export function useFriendSuggestions(userId: string | undefined, limit = 10) {
  return useQuery({
    queryKey: ['friend-suggestions', userId, limit],
    queryFn: () => fetchFriendSuggestions(limit),
    enabled: !!userId,
    staleTime: 60_000,
  })
}

export function useBlockedUsers(userId: string | undefined) {
  return useQuery({
    queryKey: ['blocked-users', userId],
    queryFn: () => fetchBlockedUsers(),
    enabled: !!userId,
    staleTime: 30_000,
  })
}

export function useSendFriendRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (recipientId: string) => sendFriendRequest(recipientId),
    onSettled: () => invalidateFriendData(queryClient),
  })
}

export function useAcceptFriendRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (requestId: string) => acceptFriendRequest(requestId),
    onSettled: () => invalidateFriendData(queryClient),
  })
}

/** Decline, cancel and unfriend are the same delete — see removeFriendship. */
export function useRemoveFriendship() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (friendshipId: string) => removeFriendship(friendshipId),
    onSettled: () => invalidateFriendData(queryClient),
  })
}

export function useBlockUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (targetUserId: string) => blockUser(targetUserId),
    onSettled: () => invalidateFriendData(queryClient),
  })
}

export function useUnblockUser(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (blockedId: string) => unblockUser(userId!, blockedId),
    onSettled: () => invalidateFriendData(queryClient),
  })
}
