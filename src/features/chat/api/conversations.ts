import { supabase } from '@/lib/supabase'
import { decryptV2ForUser, getCandidateFingerprints, decodePhase1 } from '@/features/chat/hooks/useEncryption'
import { fetchEnvelopesForMessages } from './messages'
import type { ConversationListItem, DecryptedMessage, MemberSummary, Profile } from '../types'

/** One row of `get_conversation_summaries()` (migration 20260927000001). */
interface ConversationSummaryRow {
  conversation_id: string
  last_message_id: string | null
  last_sender_id: string | null
  last_content: string | null
  last_iv: string | null
  last_enc_v: number | null
  last_type: string | null
  last_created_at: string | null
  unread_count: number
  mention_unread_count: number
}

export async function fetchConversations(userId: string): Promise<ConversationListItem[]> {
  const { data: memberRows, error } = await supabase
    .from('conversation_members')
    .select(`
      last_read_at,
      is_muted,
      muted_until,
      mute_mentions,
      request_state,
      conversations (
        id,
        name,
        type,
        avatar_url,
        updated_at,
        conversation_members (
          user_id,
          role,
          last_read_at,
          profiles (
            id,
            username,
            display_name,
            avatar_url,
            is_online,
            last_seen_at
          )
        )
      )
    `)
    .eq('user_id', userId)
    .order('updated_at', { referencedTable: 'conversations', ascending: false })

  if (error) throw error
  if (!memberRows) return []

  // Message requests must not inflate the unread badge on the main list — they
  // are counted separately by the Message requests section.
  const myRequestState: Record<string, string> = {}
  for (const row of memberRows) {
    const conv = row.conversations as unknown as { id: string } | null
    if (!conv) continue
    myRequestState[conv.id] =
      (row as unknown as { request_state: string | null }).request_state ?? 'accepted'
  }

  // One row per conversation: newest live message (still ciphertext) plus raw
  // unread counts. Replaced a select of EVERY non-deleted message across every
  // conversation (no limit) that was scanned here on each realtime event. The
  // unread rule matches the push badge's: no system messages, nothing from me
  // or a deleted sender, only after my last_read_at.
  const { data: summaries, error: summariesError } = await supabase.rpc('get_conversation_summaries')
  if (summariesError) throw summariesError

  const lastMessages: Record<string, DecryptedMessage> = {}
  const unreadCounts: Record<string, number> = {}
  const mentionUnreadCounts: Record<string, number> = {}
  // enc_v = 2 previews are decrypted after the loop via one batched envelope
  // fetch, and awaited before returning — no flash of ciphertext.
  const v2Previews: Array<{ convId: string; messageId: string; content: string; iv: string | null }> = []

  for (const s of summaries as unknown as ConversationSummaryRow[]) {
    if (myRequestState[s.conversation_id] === 'accepted') {
      unreadCounts[s.conversation_id] = s.unread_count
      mentionUnreadCounts[s.conversation_id] = s.mention_unread_count
    }
    if (!s.last_message_id || !s.last_created_at) continue

    const content = s.last_content ?? ''
    let preview = content
    let decryptFailed = false

    if (s.last_enc_v === 2) {
      // Envelope-encrypted — same for groups and DMs. Decrypted in one
      // batched pass below; placeholder until then.
      v2Previews.push({ convId: s.conversation_id, messageId: s.last_message_id, content, iv: s.last_iv })
      preview = ''
    } else if (!s.last_iv) {
      // Phase-1 fallback / system messages: plain base64, no key needed.
      preview = decodePhase1(content)
    } else {
      // Legacy pairwise ciphertext (pre-envelope migration) — unreadable.
      console.debug('[yaply:crypto] sidebar preview: legacy pairwise ciphertext', { convId: s.conversation_id })
      preview = ''
      decryptFailed = true
    }

    lastMessages[s.conversation_id] = {
      id: s.last_message_id,
      conversationId: s.conversation_id,
      senderId: s.last_sender_id,
      content: preview,
      decryptFailed,
      type: s.last_type ?? 'text',
      mediaUrl: null,
      replyToId: null,
      threadId: null,
      editedAt: null,
      deletedAt: null,
      createdAt: s.last_created_at,
    }
  }

  if (v2Previews.length > 0) {
    try {
      const fps = await getCandidateFingerprints(userId)
      const envelopes = fps.length > 0
        ? await fetchEnvelopesForMessages(v2Previews.map((p) => p.messageId), fps)
        : new Map<string, never>()
      console.debug('[yaply:crypto] sidebar preview envelope batch', { requested: v2Previews.length, found: envelopes.size })
      await Promise.all(
        v2Previews.map(async (p) => {
          try {
            lastMessages[p.convId].content = await decryptV2ForUser(userId, envelopes.get(p.messageId), p.content, p.iv)
            console.debug('[yaply:crypto] sidebar preview v2 decrypt ok', { convId: p.convId })
          } catch (err: unknown) {
            console.error('[yaply:crypto] sidebar preview v2 decrypt FAILED', { convId: p.convId, err })
            lastMessages[p.convId].content = ''
            lastMessages[p.convId].decryptFailed = true
          }
        }),
      )
    } catch (err: unknown) {
      console.error('[yaply:crypto] sidebar preview envelope batch FAILED', { err })
      for (const p of v2Previews) {
        lastMessages[p.convId].content = ''
        lastMessages[p.convId].decryptFailed = true
      }
    }
  }

  return memberRows
    .map((row) => {
      const conv = row.conversations as unknown as {
        id: string
        name: string | null
        type: string
        avatar_url: string | null
        updated_at: string
        conversation_members: Array<{
          user_id: string
          role: string
          last_read_at: string | null
          profiles: Profile | null
        }>
      } | null

      if (!conv) return null

      const members: MemberSummary[] = (conv.conversation_members ?? [])
        .filter((cm) => cm.profiles)
        .map((cm) => ({
          userId: cm.user_id,
          profile: cm.profiles!,
          isAdmin: cm.role === 'owner' || cm.role === 'admin',
          isMuted: false,
          lastReadAt: cm.last_read_at,
        }))

      const lastMsg = lastMessages[conv.id] ?? null
      const unreadCount = unreadCounts[conv.id] ?? 0
      const mentionUnreadCount = mentionUnreadCounts[conv.id] ?? 0

      const rowMutedUntil = (row as unknown as { muted_until: string | null }).muted_until
      const isMuted = rowMutedUntil ? new Date(rowMutedUntil) > new Date() : false
      const muteMentions = (row as unknown as { mute_mentions: boolean | null }).mute_mentions ?? false

      const item: ConversationListItem = {
        id: conv.id,
        name: conv.name,
        isGroup: conv.type === 'group',
        avatarUrl: conv.avatar_url,
        members,
        lastMessage: lastMsg,
        unreadCount,
        isMuted,
        mutedUntil: rowMutedUntil,
        requestState: (myRequestState[conv.id] ?? 'accepted') as ConversationListItem['requestState'],
        updatedAt: conv.updated_at,
        mentionUnreadCount,
        muteMentions,
      }
      return item
    })
    .filter((c): c is ConversationListItem => c !== null)
    .sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ?? a.updatedAt
      const bTime = b.lastMessage?.createdAt ?? b.updatedAt
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })
}

// Uses the find_or_create_direct_conversation RPC (security definer — bypasses RLS correctly).
export async function createDirectConversation(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('find_or_create_direct_conversation', {
    target_user_id: otherUserId,
  })
  if (error) throw error
  return data
}

export async function createGroupConversation(
  userId: string,
  memberIds: string[],
  name: string,
): Promise<string> {
  const otherMembers = Array.from(new Set(memberIds)).filter((uid) => uid !== userId)
  const { data, error } = await supabase.rpc('create_group_conversation', {
    p_name: name || 'Group',
    p_member_ids: otherMembers,
  })
  if (error) throw error
  return data
}

/**
 * Routed through the search_users RPC rather than querying `profiles` directly:
 * the RPC also matches display_name and, crucially, excludes anyone blocked in
 * either direction. `profiles` is world-readable (`using (true)`), so that
 * exclusion cannot be expressed as a policy without breaking the nested profile
 * joins the whole app depends on.
 */
export async function searchUsers(query: string, currentUserId: string): Promise<Profile[]> {
  const { data, error } = await supabase.rpc('search_users', { p_query: query })
  if (error) throw error
  return ((data ?? []) as unknown as Profile[]).filter((p) => p.id !== currentUserId)
}

export async function muteConversation(
  conversationId: string,
  userId: string,
  mutedUntil: Date | null,
  muteMentions = false,
): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .update({
      is_muted: mutedUntil !== null,
      muted_until: mutedUntil?.toISOString() ?? null,
      // Unmuting always resets mute_mentions too — it's meaningless while
      // muted_until is null.
      mute_mentions: mutedUntil === null ? false : muteMentions,
    })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}

// Goes through the RPC so the "only friends can be added to a group" rule is
// enforced server-side in one place (the RLS with-check on conversation_members
// is the second line of defence).
export async function addGroupMember(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('add_group_member', {
    p_conversation_id: conversationId,
    p_user_id: userId,
  })
  if (error) throw error
}

export async function removeGroupMember(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function deleteConversation(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function promoteMemberToAdmin(conversationId: string, targetUserId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .update({ role: 'admin' })
    .eq('conversation_id', conversationId)
    .eq('user_id', targetUserId)
  if (error) throw error
}

export async function deleteGroupForEveryone(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId)
  if (error) throw error
}

export async function markConversationRead(
  conversationId: string,
  userId: string,
): Promise<void> {
  // .select('user_id') forces the response to include the touched row(s) —
  // without it a silently-mismatched WHERE clause (e.g. a stale userId)
  // "succeeds" while updating zero rows, and last_read_at never advances
  // with nothing in the client to indicate why.
  const { data, error } = await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .select('user_id')

  if (error) throw error
  if (data.length === 0) {
    console.error('[yaply] markConversationRead touched 0 rows', { conversationId, userId })
  }
}
