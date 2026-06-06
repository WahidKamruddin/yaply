import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchConversations } from '../api/conversations'

export function useConversations(userId: string | undefined) {
  const queryClient = useQueryClient()
  // Each hook instance gets its own channel name to avoid the "cannot add callbacks
  // after subscribe()" error when useConversations is mounted more than once.
  const channelRef = useRef(`presence-profiles-${Math.random().toString(36).slice(2)}`)
  const messagesChannelRef = useRef(`messages-preview-${Math.random().toString(36).slice(2)}`)

  // Invalidate when any profile's is_online changes — keeps presence indicators live.
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(channelRef.current)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['conversations', userId] })
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [userId, queryClient])

  // Invalidate conversations list on any new message so the preview updates
  // regardless of which conversation is currently open.
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(messagesChannelRef.current)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['conversations', userId] })
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [userId, queryClient])

  return useQuery({
    queryKey: ['conversations', userId],
    queryFn: () => fetchConversations(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  })
}
