import { useQuery } from '@tanstack/react-query'
import { fetchConversations } from '../api/conversations'

export function useConversations(userId: string | undefined) {
  return useQuery({
    queryKey: ['conversations', userId],
    queryFn: () => fetchConversations(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  })
}
