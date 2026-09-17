import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Profile {
  id: string
  display_name: string | null
  username: string
  avatar_url: string | null
  bio: string | null
  birthdate: string | null
  username_set: boolean
  is_online: boolean
  last_seen_at: string | null
}

export function useProfile(userId: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, bio, birthdate, username_set, is_online, last_seen_at')
        .eq('id', userId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    retry: false,
  })
}
