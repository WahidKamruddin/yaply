import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Profile {
  display_name: string | null
  username: string | null
  avatar_url: string | null
  bio: string | null
  birthdate: string | null
  username_set: boolean
}

export function useProfile(userId: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, username, avatar_url, bio, birthdate, username_set')
        .eq('id', userId)
        .single()
      if (error) throw error
      return data as Profile
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    retry: false,
  })
}
