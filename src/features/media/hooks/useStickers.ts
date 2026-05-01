import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface Sticker {
  id: string
  user_id: string
  storage_path: string
  name: string
  created_at: string
}

export function useStickers(userId: string) {
  return useQuery({
    queryKey: ['stickers', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stickers')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Sticker[]
    },
    enabled: !!userId,
  })
}

export function useCreateSticker(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ blob, name }: { blob: Blob; name: string }) => {
      const { uploadStickerFile } = await import('../api/upload')
      return uploadStickerFile(blob, userId, name)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['stickers', userId] }),
  })
}

export function useDeleteSticker(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (stickerId: string) => {
      const { error } = await supabase.from('stickers').delete().eq('id', stickerId).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['stickers', userId] }),
  })
}
