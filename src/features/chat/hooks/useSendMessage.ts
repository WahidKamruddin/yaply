import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sendMessage } from '../api/messages'
import type { SendMessageParams } from '../types'

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: SendMessageParams) => sendMessage(params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}
