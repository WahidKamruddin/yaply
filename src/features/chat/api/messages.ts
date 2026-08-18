import { supabase } from '@/lib/supabase'
import type { DbMessage, SendMessageParams } from '../types'
import type { DbEnvelope } from '../hooks/useEncryption'

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
      enc_v,
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
    .is('thread_id', null)
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
  // Envelope-encrypted sends go through the RPC so the message row (enc_v = 2)
  // and its envelopes commit in one transaction — a v2 message must never
  // exist without envelopes (that state is reserved for "sealed before this
  // device existed").
  if (params.envelopes && params.envelopes.length > 0) {
    if (!params.iv) throw new Error('[yaply] envelope send requires an iv (enc_v = 2 invariant)')
    const { data, error } = await supabase.rpc('send_message_with_envelopes', {
      p_conversation_id: params.conversationId,
      p_content: params.content,
      p_iv: params.iv,
      p_envelopes: params.envelopes.map((e) => ({
        recipient_user_id: e.recipientUserId,
        recipient_fp: e.recipientFp,
        eph_pub: e.ephPub,
        key_iv: e.keyIv,
        wrapped_key: e.wrappedKey,
      })),
      p_type: params.type ?? 'text',
      p_reply_to_id: params.replyToId ?? null,
      p_thread_id: params.threadId ?? null,
      p_media_url: params.mediaUrl ?? null,
      p_media_mime: params.mediaMime ?? null,
    })
    if (error) throw error
    return data as unknown as DbMessage
  }

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
      deleted_at: params.deletedAt ?? null,
    })
    .select(`
      id,
      conversation_id,
      sender_id,
      content,
      iv,
      enc_v,
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

// Envelopes this install can open for the given enc_v = 2 messages, in one
// query. `candidateFps` is this device's own fingerprint plus any escrowed
// ones adopted via live pairing (see getCandidateFingerprints) — a message
// sealed before this device existed only has an envelope for an escrowed
// fingerprint, which is exactly what makes history readable after linking.
//
// Returns a map messageId → envelope; a v2 message with no entry has no
// envelope this install holds a key for, which is a legitimate permanent
// state, not an error.
export async function fetchEnvelopesForMessages(
  messageIds: string[],
  candidateFps: string[],
): Promise<Map<string, DbEnvelope>> {
  const map = new Map<string, DbEnvelope>()
  if (messageIds.length === 0 || candidateFps.length === 0) return map
  const { data, error } = await supabase
    .from('message_envelopes')
    .select('message_id, recipient_fp, eph_pub, key_iv, wrapped_key')
    .in('message_id', messageIds)
    .in('recipient_fp', candidateFps)
  if (error) throw error
  // A message can match more than one candidate (this device *and* an escrowed
  // one both received envelopes). Prefer the earliest fingerprint in the
  // candidate list — getCandidateFingerprints puts this device's own key
  // first, so we decrypt with the local key whenever it's an option.
  const rank = new Map(candidateFps.map((fp, i) => [fp, i]))
  for (const row of (data ?? []) as DbEnvelope[]) {
    const existing = map.get(row.message_id)
    if (
      !existing ||
      (rank.get(row.recipient_fp) ?? Infinity) < (rank.get(existing.recipient_fp) ?? Infinity)
    ) {
      map.set(row.message_id, row)
    }
  }
  return map
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
      enc_v,
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
