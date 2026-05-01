import { supabase } from '@/lib/supabase'

export interface ThreadArgs {
  conversationId: string
  senderId: string
  args: string[]
  parentMessageId?: string | null
}

export async function threadHandler({ conversationId, senderId, args, parentMessageId }: ThreadArgs): Promise<string> {
  const threadName = args.join(' ') || 'Thread'
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    encrypted_content: btoa(threadName),
    message_type: 3,
    sender_device_id: 1,
    content_hint: 'system',
    thread_name: threadName,
    parent_message_id: parentMessageId ?? null,
  })
  if (error) throw error
  return `Thread "${threadName}" started`
}
