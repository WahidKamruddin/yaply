import { helpHandler } from './handlers/helpHandler'
import { remindHandler } from './handlers/remindHandler'
import { muteHandler } from './handlers/muteHandler'
import { threadHandler } from './handlers/threadHandler'
import { createHandler, type CreateItemType } from './handlers/createHandler'
import type { MemberSummary } from '@/features/chat/types'

export interface CommandContext {
  conversationId: string
  userId: string
  args: string[]
  rawArgs: string
  members: MemberSummary[]
  openModal: (type: CreateItemType, title?: string) => void
  sendSystemMessage: (text: string) => void
  parentMessageId?: string | null
}

export async function executeCommand(name: string, ctx: CommandContext): Promise<void> {
  let result = ''

  switch (name) {
    case 'help':
      result = helpHandler()
      break

    case 'remind':
      result = await remindHandler({
        conversationId: ctx.conversationId,
        createdBy: ctx.userId,
        args: ctx.args,
        members: ctx.members.map((m) => ({ userId: m.userId, profile: { username: m.profile.username } })),
      })
      break

    case 'mute':
      result = await muteHandler({
        conversationId: ctx.conversationId,
        userId: ctx.userId,
        args: ctx.args,
      })
      break

    case 'thread':
      result = await threadHandler({
        conversationId: ctx.conversationId,
        senderId: ctx.userId,
        args: ctx.args,
        parentMessageId: ctx.parentMessageId,
      })
      break

    case 'create':
    case 'task':
    case 'poll':
    case 'event':
    case 'note':
    case 'album':
    case 'budget':
    case 'plan': {
      const args = name === 'create' ? ctx.args : [name, ...ctx.args]
      result = createHandler({
        conversationId: ctx.conversationId,
        createdBy: ctx.userId,
        args,
        openModal: ctx.openModal,
      })
      break
    }

    default:
      result = `Unknown command "/${name}". Type /help to see available commands.`
  }

  if (result) ctx.sendSystemMessage(result)
}
