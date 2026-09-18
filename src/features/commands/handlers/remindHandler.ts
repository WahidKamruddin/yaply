import { supabase } from '@/lib/supabase'
import { parseDateTimeArgs } from '../commandParser'
import { postItemCreated } from '@/features/chat/api/messages'

export interface RemindArgs {
  conversationId: string
  createdBy: string
  args: string[]
}

// Returns local error feedback, or '' on success — success is announced to
// the whole chat by the item-created pill instead.
export async function remindHandler({ conversationId, createdBy, args }: RemindArgs): Promise<string> {
  if (args.length < 3) return 'Usage: /remind [date] [time] [message]\nDate: MM/DD/YYYY · Time: HH:MM or HH:MMam/pm\nExample: /remind 06/15/2026 3:00pm Call Alice'

  const [dateStr, timeStr, ...messageParts] = args
  const message = messageParts.join(' ')

  if (!message) return 'Please include a reminder message after the date and time.'

  const remindAt = parseDateTimeArgs(dateStr, timeStr)
  if (!remindAt) return `Couldn't parse date/time. Use today, tomorrow, or MM/DD/YYYY and HH:MM or HH:MMam/pm.\nExample: /remind tomorrow 3:00pm Call Alice`

  if (remindAt.getTime() <= Date.now()) return `That time is in the past. Pick a future date/time.`

  const { data: reminder, error } = await supabase.from('reminders').insert({
    conversation_id: conversationId,
    user_id: createdBy,
    message,
    remind_at: remindAt.toISOString(),
    status: 'pending',
  }).select('id').single()

  if (error) throw error

  void postItemCreated(conversationId, createdBy, { kind: 'reminder', id: reminder.id, title: message })
  return ''
}
