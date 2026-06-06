import { supabase } from '@/lib/supabase'

export interface MessageReaction {
  messageId: string
  userId: string
  emoji: string
}

export interface ReactionGroup {
  emoji: string
  count: number
  reactedByMe: boolean
}

export function buildReactionGroups(
  reactions: MessageReaction[],
  currentUserId: string,
): Record<string, ReactionGroup[]> {
  const map: Record<string, Record<string, { count: number; reactedByMe: boolean }>> = {}
  for (const r of reactions) {
    if (!map[r.messageId]) map[r.messageId] = {}
    if (!map[r.messageId]![r.emoji]) map[r.messageId]![r.emoji] = { count: 0, reactedByMe: false }
    map[r.messageId]![r.emoji]!.count++
    if (r.userId === currentUserId) map[r.messageId]![r.emoji]!.reactedByMe = true
  }
  return Object.fromEntries(
    Object.entries(map).map(([msgId, emojiMap]) => [
      msgId,
      Object.entries(emojiMap).map(([emoji, v]) => ({ emoji, count: v.count, reactedByMe: v.reactedByMe })),
    ]),
  )
}

export async function fetchReactions(messageIds: string[]): Promise<MessageReaction[]> {
  if (!messageIds.length) return []
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji')
    .in('message_id', messageIds)
  if (error) throw error
  return ((data ?? []) as { message_id: string; user_id: string; emoji: string }[]).map((r) => ({
    messageId: r.message_id,
    userId: r.user_id,
    emoji: r.emoji,
  }))
}

export async function addReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .upsert(
      { message_id: messageId, user_id: userId, emoji },
      { onConflict: 'message_id,user_id,emoji', ignoreDuplicates: true },
    )
  if (error) throw error
}

export async function removeReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
  if (error) throw error
}
