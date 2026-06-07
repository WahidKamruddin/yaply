import { supabase } from '@/lib/supabase'
import { parseDateTimeArgs } from '../commandParser'

export interface RemindArgs {
  conversationId: string
  createdBy: string
  args: string[]
}

export async function remindHandler({ conversationId, createdBy, args }: RemindArgs): Promise<string> {
  if (args.length < 3) return 'Usage: /remind [date] [time] [message]\nDate: MM/DD/YYYY · Time: HH:MM or HH:MMam/pm\nExample: /remind 06/15/2026 3:00pm Call Alice'

  const [dateStr, timeStr, ...messageParts] = args
  const message = messageParts.join(' ')

  if (!message) return 'Please include a reminder message after the date and time.'

  const remindAt = parseDateTimeArgs(dateStr!, timeStr!)
  if (!remindAt) return `Couldn't parse date/time. Use today, tomorrow, or MM/DD/YYYY and HH:MM or HH:MMam/pm.\nExample: /remind tomorrow 3:00pm Call Alice`

  const { error } = await supabase.from('reminders').insert({
    conversation_id: conversationId,
    user_id: createdBy,
    message,
    remind_at: remindAt.toISOString(),
    status: 'pending',
  })

  if (error) throw error

  const formatted = remindAt.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
  return `⏰ Reminder set for ${formatted}: "${message}"`
}
