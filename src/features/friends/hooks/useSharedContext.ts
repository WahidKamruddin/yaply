import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useConversations } from '@/features/chat/hooks/useConversations'
import type { ConversationListItem } from '@/features/chat/types'
import type { Event } from '@/features/chat/hooks/useEvents'
import type { Album } from '@/features/chat/hooks/useAlbums'
import type { Budget } from '@/features/chat/hooks/useBudgets'

/** The owning conversation, embedded so a row can say which chat it came from. */
interface WithConversation {
  conversation: { id: string; name: string | null } | null
}

export type SharedEvent = Event & WithConversation
export type SharedAlbum = Album & WithConversation
export type SharedBudget = Budget & WithConversation

export interface SharedContent {
  events: SharedEvent[]
  albums: SharedAlbum[]
  budgets: SharedBudget[]
}

const EMPTY: SharedContent = { events: [], albums: [], budgets: [] }

/**
 * Everything the viewer and `otherUserId` have in common.
 *
 * The shared conversation set is derived from the already-cached
 * `['conversations', userId]` query rather than a new RPC — `fetchConversations`
 * returns every conversation I'm in *with its full member list*, so the
 * intersection is free and needs no SQL. Events/albums/budgets are then read with
 * an `.in('conversation_id', …)`; their RLS is already "conversation members can
 * SELECT", so the result is correctly scoped without any extra guard.
 */
export function useSharedContext(currentUserId: string | undefined, otherUserId: string) {
  const { data: conversations, isLoading: conversationsLoading } = useConversations(currentUserId)

  const sharedConversations = useMemo<ConversationListItem[]>(
    () => (conversations ?? []).filter((c) => c.members.some((m) => m.userId === otherUserId)),
    [conversations, otherUserId],
  )

  // DMs count too — an album in your one-to-one chat is genuinely shared. Only
  // the Groups list itself filters down to groups.
  const sharedIds = useMemo(
    () => sharedConversations.map((c) => c.id).sort(),
    [sharedConversations],
  )

  const sharedGroups = useMemo(
    () => sharedConversations.filter((c) => c.isGroup),
    [sharedConversations],
  )

  const contentQuery = useQuery({
    queryKey: ['shared-content', currentUserId, otherUserId, sharedIds.join(',')],
    queryFn: async (): Promise<SharedContent> => {
      if (sharedIds.length === 0) return EMPTY

      const [events, albums, budgets] = await Promise.all([
        supabase
          .from('events')
          .select(
            '*, creator:profiles!events_created_by_fkey(display_name, username), conversation:conversations(id, name)',
          )
          .in('conversation_id', sharedIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('albums')
          .select(
            '*, creator:profiles!albums_created_by_fkey(display_name, username), album_media(media_url), conversation:conversations(id, name)',
          )
          .in('conversation_id', sharedIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('budgets')
          .select(
            '*, creator:profiles!budgets_created_by_fkey(display_name, username), conversation:conversations(id, name)',
          )
          .in('conversation_id', sharedIds)
          .order('created_at', { ascending: false }),
      ])

      if (events.error) throw events.error
      if (albums.error) throw albums.error
      if (budgets.error) throw budgets.error

      return {
        events: events.data as unknown as SharedEvent[],
        albums: albums.data as unknown as SharedAlbum[],
        budgets: budgets.data as unknown as SharedBudget[],
      }
    },
    enabled: !!currentUserId && sharedIds.length > 0,
    staleTime: 30_000,
  })

  return {
    groups: sharedGroups,
    content: contentQuery.data ?? EMPTY,
    isLoading: conversationsLoading || (sharedIds.length > 0 && contentQuery.isLoading),
  }
}
