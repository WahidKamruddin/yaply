import { muteConversation } from '@/features/chat/api/conversations'
import { parseDuration } from '../commandParser'

export interface MuteArgs {
  conversationId: string
  userId: string
  args: string[]
}

export async function muteHandler({ conversationId, userId, args }: MuteArgs): Promise<string> {
  const durationStr = args[0] ?? 'forever'
  const until = parseDuration(durationStr)
  await muteConversation(conversationId, userId, until)
  return until
    ? `Conversation muted until ${until.toLocaleString()}`
    : 'Conversation muted indefinitely'
}
