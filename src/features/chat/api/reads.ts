import { supabase } from '@/lib/supabase'

export async function insertReadReceipts(messageIds: string[], userId: string): Promise<void> {
  if (messageIds.length === 0) return
  const { error } = await supabase
    .from('message_reads')
    .upsert(
      messageIds.map((id) => ({ message_id: id, user_id: userId })),
      { onConflict: 'message_id,user_id', ignoreDuplicates: true },
    )
  if (error) throw error
}

// Returns the set of message IDs that have been read by someone other than currentUserId.
export async function fetchReadSet(
  messageIds: string[],
  currentUserId: string,
): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('message_reads')
    .select('message_id')
    .in('message_id', messageIds)
    .neq('user_id', currentUserId)
  if (error) throw error
  return new Set((data ?? []).map((r) => r.message_id as string))
}
