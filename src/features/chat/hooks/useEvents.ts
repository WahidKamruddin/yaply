import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Event {
  id: string
  conversation_id: string
  created_by: string
  name: string
  description: string | null
  location: string | null
  status: 'planning' | 'confirmed'
  starts_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
  creator: { display_name: string | null; username: string | null } | null
}

export interface EventAvailability {
  id: string
  event_id: string
  user_id: string
  slots: string[]
  updated_at: string
}

export interface EventRsvp {
  id: string
  event_id: string
  user_id: string
  response: 'going' | 'maybe' | 'not_going' | 'pending'
  updated_at: string
}

export function useEvents(conversationId: string | null) {
  return useQuery({
    queryKey: ['events', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('events')
        .select('*, creator:profiles!events_created_by_fkey(display_name, username)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Event[]
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  })
}

export function useEventAvailability(eventId: string | null) {
  return useQuery({
    queryKey: ['event-availability', eventId],
    queryFn: async () => {
      if (!eventId) return []
      const { data, error } = await supabase
        .from('event_availability')
        .select('*')
        .eq('event_id', eventId)
      if (error) throw error
      return data as EventAvailability[]
    },
    enabled: !!eventId,
    staleTime: 15_000,
  })
}

export function useSetAvailability(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, slots }: { userId: string; slots: string[] }) => {
      const { error } = await supabase
        .from('event_availability')
        .upsert({ event_id: eventId, user_id: userId, slots, updated_at: new Date().toISOString() },
          { onConflict: 'event_id,user_id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-availability', eventId] }),
  })
}

export function useEventRsvp(eventId: string | null) {
  return useQuery({
    queryKey: ['event-rsvp', eventId],
    queryFn: async () => {
      if (!eventId) return []
      const { data, error } = await supabase
        .from('event_rsvp')
        .select('*')
        .eq('event_id', eventId)
      if (error) throw error
      return data as EventRsvp[]
    },
    enabled: !!eventId,
    staleTime: 15_000,
  })
}

export function useSetRsvp(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, response }: { userId: string; response: EventRsvp['response'] }) => {
      const { error } = await supabase
        .from('event_rsvp')
        .upsert({ event_id: eventId, user_id: userId, response, updated_at: new Date().toISOString() },
          { onConflict: 'event_id,user_id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-rsvp', eventId] }),
  })
}

export function useConfirmEventTime(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ startsAt, endsAt }: { startsAt: string; endsAt?: string }) => {
      const { error } = await supabase
        .from('events')
        .update({ status: 'confirmed', starts_at: startsAt, ends_at: endsAt ?? null, updated_at: new Date().toISOString() })
        .eq('id', eventId)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.from('events').delete().eq('id', eventId)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['events'] })
      // DB ON DELETE SET NULL fires on albums/notes/budgets; invalidate their caches too
      void qc.invalidateQueries({ queryKey: ['albums'] })
      void qc.invalidateQueries({ queryKey: ['notes'] })
      void qc.invalidateQueries({ queryKey: ['budgets'] })
    },
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      conversationId: string
      createdBy: string
      name: string
      description?: string
      location?: string
      status: 'planning' | 'confirmed'
      startsAt?: string
      endsAt?: string
    }) => {
      const { data, error } = await supabase
        .from('events')
        .insert({
          conversation_id: params.conversationId,
          created_by: params.createdBy,
          name: params.name,
          description: params.description ?? null,
          location: params.location ?? null,
          status: params.status,
          starts_at: params.startsAt ?? null,
          ends_at: params.endsAt ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data as Event
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['events', vars.conversationId] })
    },
  })
}

export function useLinkToEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ table, itemId, eventId }: { table: 'albums' | 'notes' | 'budgets'; itemId: string; eventId: string | null }) => {
      const { error } = await supabase
        .from(table)
        .update({ event_id: eventId })
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: [vars.table] })
      void qc.invalidateQueries({ queryKey: ['event-' + vars.table, vars.eventId] })
    },
  })
}

// Per-event resource queries
export function useEventNotes(eventId: string | null) {
  return useQuery({
    queryKey: ['event-notes', eventId],
    queryFn: async () => {
      if (!eventId) return []
      const { data, error } = await supabase.from('notes').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!eventId,
    staleTime: 30_000,
  })
}

export function useEventAlbums(eventId: string | null) {
  return useQuery({
    queryKey: ['event-albums', eventId],
    queryFn: async () => {
      if (!eventId) return []
      const { data, error } = await supabase.from('albums').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!eventId,
    staleTime: 30_000,
  })
}

export function useEventBudgets(eventId: string | null) {
  return useQuery({
    queryKey: ['event-budgets', eventId],
    queryFn: async () => {
      if (!eventId) return []
      const { data, error } = await supabase.from('budgets').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!eventId,
    staleTime: 30_000,
  })
}
