import { remindHandler } from './handlers/remindHandler'
import { muteHandler } from './handlers/muteHandler'
import type { CreateItemType } from './handlers/createHandler'
import { createHandler } from './handlers/createHandler'
import type { MemberSummary } from '@/features/chat/types'
import type { QueryClient } from '@tanstack/react-query'

export interface CommandContext {
  conversationId: string
  userId: string
  args: string[]
  rawArgs: string
  members: MemberSummary[]
  queryClient: QueryClient
  openModal: (type: CreateItemType, title?: string) => void
  openHelp: () => void
  sendSystemMessage: (text: string) => Promise<void>
  showLocalFeedback: (text: string) => void
}

export async function executeCommand(name: string, ctx: CommandContext): Promise<void> {
  let result = ''

  switch (name) {
    case 'help':
      ctx.openHelp()
      break

    case 'remind':
      result = await remindHandler({
        conversationId: ctx.conversationId,
        createdBy: ctx.userId,
        args: ctx.args,
      })
      if (result.startsWith('⏰')) {
        void ctx.queryClient.invalidateQueries({ queryKey: ['reminders'] })
      }
      break

    case 'mute':
      result = await muteHandler({
        conversationId: ctx.conversationId,
        userId: ctx.userId,
        args: ctx.args,
      })
      break

    case 'task':
    case 'poll':
    case 'event':
    case 'note':
    case 'album':
    case 'budget':
    case 'plan': {
      result = createHandler({
        conversationId: ctx.conversationId,
        createdBy: ctx.userId,
        args: [name, ...ctx.args],
        openModal: ctx.openModal,
      })
      break
    }

    default:
      result = `Unknown command "/${name}". Type /help to see available commands.`
  }

  if (result) ctx.showLocalFeedback(result)
}
