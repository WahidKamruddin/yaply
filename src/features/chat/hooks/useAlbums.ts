import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Album {
  id: string
  conversation_id: string
  name: string
  created_by: string
  created_at: string
  event_id: string | null
  creator: { display_name: string | null; username: string | null } | null
}

export interface AlbumMedia {
  id: string
  album_id: string
  message_id: string | null
  media_url: string
  media_mime: string
  created_at: string
}

export interface ConversationImage {
  id: string
  media_url: string
  media_mime: string
  created_at: string
}

export function useAlbums(conversationId: string | null) {
  return useQuery({
    queryKey: ['albums', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('albums')
        .select('*, creator:profiles!albums_created_by_fkey(display_name, username)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Album[]
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  })
}

export function useAlbumMedia(albumId: string | null) {
  return useQuery({
    queryKey: ['album-media', albumId],
    queryFn: async () => {
      if (!albumId) return []
      const { data, error } = await supabase
        .from('album_media')
        .select('*')
        .eq('album_id', albumId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as AlbumMedia[]
    },
    enabled: !!albumId,
    staleTime: 30_000,
  })
}

export function useCreateAlbum(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, createdBy }: { name: string; createdBy: string }) => {
      const { error } = await supabase.from('albums').insert({ conversation_id: conversationId, name, created_by: createdBy })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['albums', conversationId] }),
  })
}

export function useDeleteAlbum() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (albumId: string) => {
      const { error } = await supabase.from('albums').delete().eq('id', albumId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['albums'] }),
  })
}

export function useAddAlbumMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ albumId, messageId, mediaUrl, mediaMime }: { albumId: string; messageId: string | null; mediaUrl: string; mediaMime: string }) => {
      const { error } = await supabase.from('album_media').insert({ album_id: albumId, message_id: messageId, media_url: mediaUrl, media_mime: mediaMime })
      if (error) throw error
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['album-media', vars.albumId] }),
  })
}

export function useConversationImages(conversationId: string | null) {
  return useQuery({
    queryKey: ['conversation-images', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('messages')
        .select('id, media_url, media_mime, created_at')
        .eq('conversation_id', conversationId)
        .eq('type', 'image')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(60)
      if (error) throw error
      return data as ConversationImage[]
    },
    enabled: !!conversationId,
    staleTime: 60_000,
  })
}
