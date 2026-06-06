import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useRealtimeMessages(conversationId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
          void queryClient.invalidateQueries({ queryKey: ['conversations'] })
          void queryClient.invalidateQueries({ queryKey: ['thread-counts', conversationId] })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId, queryClient])
}
