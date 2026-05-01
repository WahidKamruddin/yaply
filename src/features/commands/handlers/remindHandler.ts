import { supabase } from '@/lib/supabase'
import { parseDateTime } from '../commandParser'

export interface RemindArgs {
  conversationId: string
  createdBy: string
  args: string[]
  members: Array<{ userId: string; profile: { username: string } }>
}

export async function remindHandler({ conversationId, createdBy, args, members }: RemindArgs): Promise<string> {
  if (args.length < 2) return 'Usage: /remind [me|all|@username] [time] [message]'

  const [target, timeStr, ...messageParts] = args
  const message = messageParts.join(' ')
  const remindAt = parseDateTime(timeStr ?? '')

  if (!remindAt) return `Could not parse time "${timeStr}". Try "tomorrow 3pm", "15:00", or "2024-12-25".`
  if (!message) return 'Please include a reminder message.'

  let targetType: 'me' | 'all' | 'user' = 'me'
  let targetUserId: string | null = null

  if (target === 'all') {
    targetType = 'all'
  } else if (target?.startsWith('@')) {
    const username = target.slice(1).toLowerCase()
    const member = members.find((m) => m.profile.username.toLowerCase() === username)
    if (!member) return `User @${username} not found in this conversation.`
    targetType = 'user'
    targetUserId = member.userId
  }

  const { error } = await supabase.from('reminders').insert({
    conversation_id: conversationId,
    created_by: createdBy,
    target_user_id: targetUserId,
    target_type: targetType,
    message,
    remind_at: remindAt.toISOString(),
  })

  if (error) throw error

  return `Reminder set for ${remindAt.toLocaleString()}: "${message}"`
}
