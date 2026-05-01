import { supabase } from '@/lib/supabase'
import type { ConversationListItem, DecryptedMessage, MemberSummary, Profile } from '../types'

export async function fetchConversations(userId: string): Promise<ConversationListItem[]> {
  const { data: memberRows, error } = await supabase
    .from('conversation_members')
    .select(`
      is_muted,
      muted_until,
      last_read_at,
      conversations (
        id,
        name,
        is_group,
        avatar_url,
        updated_at,
        conversation_members (
          user_id,
          is_admin,
          is_muted,
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

  let lastMessages: Record<string, DecryptedMessage> = {}
  if (convIds.length > 0) {
    const { data: msgs } = await supabase
      .from('messages')
      .select(`
        id,
        conversation_id,
        sender_id,
        encrypted_content,
        message_type,
        content_hint,
        encrypted_attachment_ref,
        parent_message_id,
        thread_name,
        deleted_at,
        server_timestamp
      `)
      .in('conversation_id', convIds)
      .is('deleted_at', null)
      .order('server_timestamp', { ascending: false })

    if (msgs) {
      const seen = new Set<string>()
      for (const m of msgs) {
        if (!seen.has(m.conversation_id)) {
          seen.add(m.conversation_id)
          lastMessages[m.conversation_id] = {
            id: m.id,
            conversationId: m.conversation_id,
            senderId: m.sender_id,
            content: atob(m.encrypted_content),
            messageType: m.message_type,
            contentHint: m.content_hint,
            attachmentRef: m.encrypted_attachment_ref,
            parentMessageId: m.parent_message_id,
            threadName: m.thread_name,
            deletedAt: m.deleted_at,
            serverTimestamp: m.server_timestamp,
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
        is_group: boolean
        avatar_url: string | null
        updated_at: string
        conversation_members: Array<{
          user_id: string
          is_admin: boolean
          is_muted: boolean
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
          isAdmin: cm.is_admin,
          isMuted: cm.is_muted,
          lastReadAt: cm.last_read_at,
        }))

      const lastMsg = lastMessages[conv.id] ?? null
      const myMember = conv.conversation_members.find((cm) => cm.user_id === userId)
      const myLastRead = myMember?.last_read_at

      let unreadCount = 0
      if (!myLastRead && lastMsg) {
        unreadCount = 1
      }

      const item: ConversationListItem = {
        id: conv.id,
        name: conv.name,
        isGroup: conv.is_group,
        avatarUrl: conv.avatar_url,
        members,
        lastMessage: lastMsg,
        unreadCount,
        isMuted: row.is_muted,
        mutedUntil: row.muted_until,
        updatedAt: conv.updated_at,
      }
      return item
    })
    .filter((c): c is ConversationListItem => c !== null)
}

export async function createDirectConversation(
  userId: string,
  otherUserId: string,
): Promise<string> {
  const { data: existing } = await supabase.rpc('find_direct_conversation', {
    user_a: userId,
    user_b: otherUserId,
  })

  if (existing) return existing as string

  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({ is_group: false, created_by: userId })
    .select('id')
    .single()

  if (convError || !conv) throw convError ?? new Error('Failed to create conversation')

  const { error: memberError } = await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, user_id: userId, is_admin: true },
    { conversation_id: conv.id, user_id: otherUserId, is_admin: false },
  ])

  if (memberError) throw memberError

  return conv.id
}

export async function createGroupConversation(
  userId: string,
  memberIds: string[],
  name: string,
): Promise<string> {
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({ is_group: true, name, created_by: userId })
    .select('id')
    .single()

  if (convError || !conv) throw convError ?? new Error('Failed to create group conversation')

  const allMembers = Array.from(new Set([userId, ...memberIds]))
  const { error: memberError } = await supabase.from('conversation_members').insert(
    allMembers.map((uid) => ({
      conversation_id: conv.id,
      user_id: uid,
      is_admin: uid === userId,
    })),
  )

  if (memberError) throw memberError

  return conv.id
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
