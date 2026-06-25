import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export interface Reminder {
  id: string
  user_id: string
  conversation_id: string | null
  message: string
  remind_at: string
  status: 'pending' | 'sent' | 'dismissed'
  locked: boolean
  created_at: string
  creator: {
    display_name: string | null
    username: string
  } | null
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export function useReminders(conversationId: string | null) {
  return useQuery({
    queryKey: ['reminders', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString()
      const { data, error } = await supabase
        .from('reminders')
        .select('*, creator:profiles!reminders_user_id_fkey(display_name, username)')
        .eq('conversation_id', conversationId)
        .neq('status', 'dismissed')
        .gt('remind_at', cutoff)
        .order('remind_at', { ascending: true })
      if (error) throw error
      return data as Reminder[]
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  })
}

export function useCreateReminder(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, message, remindAt }: { userId: string; message: string; remindAt: string }) => {
      const { error } = await supabase.from('reminders').insert({
        conversation_id: conversationId,
        user_id: userId,
        message,
        remind_at: remindAt,
        status: 'pending',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })
}

export function useDismissReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (reminderId: string) => {
      const { error } = await supabase
        .from('reminders')
        .update({ status: 'dismissed' })
        .eq('id', reminderId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })
}

export function useLockReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ reminderId, locked }: { reminderId: string; locked: boolean }) => {
      const { error } = await supabase.from('reminders').update({ locked }).eq('id', reminderId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })
}

export function useUpdateReminderTime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ reminderId, remindAt }: { reminderId: string; remindAt: string }) => {
      const { error } = await supabase.from('reminders').update({ remind_at: remindAt, status: 'pending' }).eq('id', reminderId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })
}

export function useReminderNotifications(currentUserId: string) {
  const qc = useQueryClient()

  useEffect(() => {
    let running = false

    async function checkReminders() {
      if (running) return
      running = true
      try {
        const now = new Date()
        const cutoff24h = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS).toISOString()

        // Hard-delete reminders that are past 24h due — RLS limits this to the user's conversations
        await supabase.from('reminders').delete().lt('remind_at', cutoff24h)

        // Fire notifications for pending reminders that are now due
        const { data } = await supabase
          .from('reminders')
          .select('*')
          .eq('status', 'pending')
          .lte('remind_at', now.toISOString())
          .gt('remind_at', cutoff24h)

        if (!data?.length) return

        if (Notification.permission === 'granted') {
          for (const reminder of data) {
            new Notification('yaply reminder', { body: reminder.message, icon: '/favicon.ico' })
          }
        }

        const ids = data.map((r) => r.id)
        await supabase.from('reminders').update({ status: 'sent' }).in('id', ids)

        void qc.invalidateQueries({ queryKey: ['reminders'] })
      } finally {
        running = false
      }
    }

    if (Notification.permission === 'default') {
      void Notification.requestPermission()
    }

    void checkReminders()
    const id = setInterval(() => void checkReminders(), 60_000)
    return () => clearInterval(id)
  }, [currentUserId, qc])
}
