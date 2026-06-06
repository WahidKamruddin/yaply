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
      content,
      iv,
      type,
      media_url,
      media_mime,
      reply_to_id,
      thread_id,
      edited_at,
      deleted_at,
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
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (cursor) {
    query = query.lt('created_at', cursor)
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
      ? (messages[messages.length - 1]?.created_at ?? null)
      : null

  return { messages, nextCursor }
}

export async function sendMessage(params: SendMessageParams): Promise<DbMessage> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: params.conversationId,
      sender_id: params.senderId,
      content: params.content,
      iv: params.iv,
      type: params.type ?? 'text',
      reply_to_id: params.replyToId ?? null,
      thread_id: params.threadId ?? null,
      media_url: params.mediaUrl ?? null,
      media_mime: params.mediaMime ?? null,
    })
    .select(`
      id,
      conversation_id,
      sender_id,
      content,
      iv,
      type,
      media_url,
      media_mime,
      reply_to_id,
      thread_id,
      edited_at,
      deleted_at,
      created_at
    `)
    .single()

  if (error) throw error
  return data as unknown as DbMessage
}

export async function fetchThreadMessages(threadRootId: string): Promise<DbMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      id,
      conversation_id,
      sender_id,
      content,
      iv,
      type,
      media_url,
      media_mime,
      reply_to_id,
      thread_id,
      edited_at,
      deleted_at,
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
    .eq('thread_id', threadRootId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return ((data ?? []) as unknown as Array<DbMessage & { profiles: DbMessage['sender_profile'] }>).map(
    (row) => ({ ...row, sender_profile: row.profiles })
  ) as DbMessage[]
}

export async function fetchThreadCounts(conversationId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('messages')
    .select('thread_id')
    .eq('conversation_id', conversationId)
    .not('thread_id', 'is', null)

  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    if (row.thread_id) counts[row.thread_id] = (counts[row.thread_id] ?? 0) + 1
  }
  return counts
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)

  if (error) throw error
}
