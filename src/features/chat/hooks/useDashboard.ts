import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Reminder } from './useReminders'
import type { Event } from './useEvents'

// Dashboard-wide queries intentionally omit a conversation_id filter — RLS
// ("members can view") already scopes rows to conversations the user belongs
// to, so an unfiltered select returns exactly the cross-conversation set the
// dashboard needs in one round trip.

export function useDashboardReminders(userId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard-reminders', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminders')
        .select('*, creator:profiles!reminders_user_id_fkey(display_name, username)')
        .eq('status', 'pending')
        .order('remind_at', { ascending: true })
        .limit(20)
      if (error) throw error
      return data as Reminder[]
    },
    enabled: !!userId,
    staleTime: 30_000,
  })
}

export function useDashboardEvents(userId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard-events', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, creator:profiles!events_created_by_fkey(display_name, username)')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data
    },
    enabled: !!userId,
    staleTime: 30_000,
  })
}
