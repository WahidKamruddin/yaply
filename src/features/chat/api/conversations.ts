import { supabase } from '@/lib/supabase'
import type { ConversationListItem, DecryptedMessage, MemberSummary, Profile } from '../types'

export async function fetchConversations(userId: string): Promise<ConversationListItem[]> {
  const { data: memberRows, error } = await supabase
    .from('conversation_members')
    .select(`
      last_read_at,
      is_muted,
      muted_until,
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

  const convIds = memberRows
    .map((r) => (r.conversations as unknown as { id: string } | null)?.id)
    .filter((id): id is string => !!id)

  // Map convId → my last_read_at so we can count unread messages below.
  const myLastReadAt: Record<string, string | null> = {}
  for (const row of memberRows) {
    const convId = (row.conversations as unknown as { id: string } | null)?.id
    if (convId) myLastReadAt[convId] = row.last_read_at
  }

  let lastMessages: Record<string, DecryptedMessage> = {}
  const unreadCounts: Record<string, number> = {}

  if (convIds.length > 0) {
    const { data: msgs } = await supabase
      .from('messages')
      .select(`
        id,
        conversation_id,
        sender_id,
        content,
        iv,
        type,
        deleted_at,
        created_at
      `)
      .in('conversation_id', convIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (msgs) {
      const seen = new Set<string>()
      for (const m of msgs as unknown as Array<{
        id: string; conversation_id: string; sender_id: string | null
        content: string; iv: string | null; type: string
        deleted_at: string | null; created_at: string
      }>) {
        if (!seen.has(m.conversation_id)) {
          seen.add(m.conversation_id)
          // Last message preview uses legacy base64 decode (no shared key available here)
          let preview = m.content
          if (!m.iv) {
            try {
              const bytes = Uint8Array.from(atob(m.content), (c) => c.charCodeAt(0))
              preview = new TextDecoder().decode(bytes)
            } catch { /* keep raw */ }
          }
          lastMessages[m.conversation_id] = {
            id: m.id,
            conversationId: m.conversation_id,
            senderId: m.sender_id,
            content: preview,
            type: m.type,
            mediaUrl: null,
            replyToId: null,
            threadId: null,
            editedAt: null,
            deletedAt: m.deleted_at,
            createdAt: m.created_at,
          }
        }

        // Count messages from others that arrived after my last read timestamp.
        if (m.sender_id !== userId) {
          const lastRead = myLastReadAt[m.conversation_id]
          if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
            unreadCounts[m.conversation_id] = (unreadCounts[m.conversation_id] ?? 0) + 1
          }
        }
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

      const rowMutedUntil = (row as unknown as { muted_until: string | null }).muted_until
      const isMuted = rowMutedUntil ? new Date(rowMutedUntil) > new Date() : false

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
        updatedAt: conv.updated_at,
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
export async function createDirectConversation(
  userId: string,
  otherUserId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('find_or_create_direct_conversation', {
    target_user_id: otherUserId,
  })
  if (error) throw error
  return data as string
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
  return data as string
}

export async function searchUsers(query: string, currentUserId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, is_online, last_seen_at')
    .ilike('username', `%${query}%`)
    .neq('id', currentUserId)
    .limit(20)

  if (error) throw error
  return (data ?? []) as unknown as Profile[]
}

export async function muteConversation(
  conversationId: string,
  userId: string,
  mutedUntil: Date | null,
): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .update({
      is_muted: mutedUntil !== null,
      muted_until: mutedUntil?.toISOString() ?? null,
    })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function addGroupMember(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .insert({ conversation_id: conversationId, user_id: userId, role: 'member' })
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('conversation_members') as any)
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
  const { error } = await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)

  if (error) throw error
}
