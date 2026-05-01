import { supabase } from '@/lib/supabase'
import type { DbMessage, SendMessageParams } from '../types'

const PAGE_SIZE = 50

export async function fetchMessages(
  conversationId: string,
  cursor?: string,
): Promise<{ messages: DbMessage[]; nextCursor: string | null }> {
  let query = supabase
    .from('messages')
    .select(`
      id,
      conversation_id,
      sender_id,
      encrypted_content,
      message_type,
      sender_device_id,
      content_hint,
      encrypted_attachment_ref,
      parent_message_id,
      thread_name,
      deleted_at,
      server_timestamp,
      created_at,
      profiles!messages_sender_id_fkey (
        id,
        username,
        display_name,
        avatar_url,
        is_online,
        last_seen_at
      )
    `)
    .eq('conversation_id', conversationId)
    .order('server_timestamp', { ascending: false })
    .limit(PAGE_SIZE)

  if (cursor) {
    query = query.lt('server_timestamp', cursor)
  }

  const { data, error } = await query

  if (error) throw error

  const messages = ((data ?? []) as unknown as Array<DbMessage & { profiles: DbMessage['sender_profile'] }>).map(
    (row) => ({
      ...row,
      sender_profile: row.profiles,
    }),
  ) as DbMessage[]

  const nextCursor =
    messages.length === PAGE_SIZE
      ? (messages[messages.length - 1]?.server_timestamp ?? null)
      : null

  return { messages, nextCursor }
}

export async function sendMessage(params: SendMessageParams): Promise<DbMessage> {
  const {
    conversationId,
    senderId,
    encryptedContent,
    messageType = 3,
    senderDeviceId = 1,
    contentHint = null,
    encryptedAttachmentRef = null,
    parentMessageId = null,
    threadName = null,
  } = params

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      encrypted_content: encryptedContent,
      message_type: messageType,
      sender_device_id: senderDeviceId,
      content_hint: contentHint,
      encrypted_attachment_ref: encryptedAttachmentRef,
      parent_message_id: parentMessageId,
      thread_name: threadName,
    })
    .select(`
      id,
      conversation_id,
      sender_id,
      encrypted_content,
      message_type,
      sender_device_id,
      content_hint,
      encrypted_attachment_ref,
      parent_message_id,
      thread_name,
      deleted_at,
      server_timestamp,
      created_at
    `)
    .single()

  if (error) throw error
  return data as unknown as DbMessage
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)

  if (error) throw error
}
