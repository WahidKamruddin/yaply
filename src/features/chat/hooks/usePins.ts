import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPins, pinMessage, unpinMessage } from '../api/pins'

/** Ordered (newest pin first) list of pinned message ids for the conversation. */
export function usePins(conversationId: string | null) {
  return useQuery({
    queryKey: ['pins', conversationId],
    queryFn: () => fetchPins(conversationId!),
    enabled: !!conversationId,
    staleTime: 10_000,
  })
}

/**
 * Toggle a message's pin state. Optimistically updates the `['pins', id]`
 * cache (insert-at-front / remove) so the banner and menu label flip
 * immediately, then reconciles with the server on settle — and rolls back by
 * refetching if the write fails.
 */
export function useTogglePin(conversationId: string, currentUserId: string) {
  const queryClient = useQueryClient()
  const key = ['pins', conversationId] as const

  return useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      pinned
        ? unpinMessage({ conversationId, messageId })
        : pinMessage({ conversationId, messageId, pinnedBy: currentUserId }),
    onMutate: async ({ messageId, pinned }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData<string[]>(key)
      queryClient.setQueryData<string[]>(key, (old = []) =>
        pinned
          ? old.filter((id) => id !== messageId)
          : [messageId, ...old.filter((id) => id !== messageId)],
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
