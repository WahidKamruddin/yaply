import { supabase } from '@/lib/supabase'

// Pinned messages live in their own table (`pinned_messages`), not a
// `messages.pinned_at` column — the messages UPDATE policy is sender-only and
// widening it just to toggle a pin would also expose content. All three
// operations are membership-scoped by RLS; any member can pin or unpin any
// message. Migration 00036_pinned_messages.sql.

/** Message ids pinned in this conversation, most-recently-pinned first. */
export async function fetchPins(conversationId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('pinned_messages')
    .select('message_id')
    .eq('conversation_id', conversationId)
    .order('pinned_at', { ascending: false })
  if (error) throw error
  return data.map((r) => r.message_id)
}

/** Idempotent — upsert on the (conversation_id, message_id) PK. */
export async function pinMessage(params: {
  conversationId: string
  messageId: string
  pinnedBy: string
}): Promise<void> {
  const { error } = await supabase.from('pinned_messages').upsert(
    {
      conversation_id: params.conversationId,
      message_id: params.messageId,
      pinned_by: params.pinnedBy,
    },
    { onConflict: 'conversation_id,message_id' },
  )
  if (error) throw error
}

export async function unpinMessage(params: {
  conversationId: string
  messageId: string
}): Promise<void> {
  const { error } = await supabase
    .from('pinned_messages')
    .delete()
    .eq('conversation_id', params.conversationId)
    .eq('message_id', params.messageId)
  if (error) throw error
}
