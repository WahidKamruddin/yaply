import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useRealtimeMessages(conversationId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!conversationId) return

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      void queryClient.invalidateQueries({ queryKey: ['thread-counts', conversationId] })
    }

    // Pin changes are just an invalidation trigger — never parse the payload
    // (same house style as message events above).
    const invalidatePins = () => {
      void queryClient.invalidateQueries({ queryKey: ['pins', conversationId] })
    }

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, invalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages', filter: `conversation_id=eq.${conversationId}` }, invalidatePins)
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId, queryClient])
}
