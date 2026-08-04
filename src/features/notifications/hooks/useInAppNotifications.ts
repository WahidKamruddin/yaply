import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { InAppNotification } from '@/features/notifications/components/NotificationBanner'
import type { ConversationListItem } from '@/features/chat/types'

export function useInAppNotifications(
  currentUserId: string,
  activeConversationId: string | null,
  conversations: ConversationListItem[],
  onNavigate: (conversationId: string) => void,
  onNavigateToFriends?: () => void,
) {
  const [notification, setNotification] = useState<InAppNotification | null>(null)
  const activeIdRef = useRef(activeConversationId)
  const navigateRef = useRef(onNavigate)
  const friendsNavRef = useRef(onNavigateToFriends)

  useEffect(() => { activeIdRef.current = activeConversationId }, [activeConversationId])
  useEffect(() => { navigateRef.current = onNavigate }, [onNavigate])
  useEffect(() => { friendsNavRef.current = onNavigateToFriends }, [onNavigateToFriends])

  useEffect(() => {
    if (!currentUserId) return

    const channel = supabase
      .channel('in-app-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as { conversation_id: string; sender_id: string | null; type: string }

          // Skip own messages and messages in the active conversation
          if (msg.sender_id === currentUserId) return
          if (msg.conversation_id === activeIdRef.current) return

          const conv = conversations.find((c) => c.id === msg.conversation_id)
          if (!conv) return
          // A pending or declined message request must not pop a banner — the
          // whole point of a request is that it stays quiet until accepted.
          if (conv.requestState !== 'accepted') return

          const sender = conv.members.find((m) => m.userId === msg.sender_id)
          const senderName =
            sender?.profile.display_name ?? sender?.profile.username ?? 'Someone'

          const convId = msg.conversation_id
          setNotification({
            id: `${convId}-${Date.now()}`,
            conversationId: convId,
            senderName,
            preview: msg.type === 'text' ? 'Sent a message' : `Sent a ${msg.type}`,
            kind: 'message',
            onNavigate: () => navigateRef.current(convId),
          })
        },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [currentUserId, conversations])

  // Friend requests and acceptances. Unlike the messages channel this one has to
  // read the payload (there is no list to look the row up in), so it fetches the
  // other person's name before showing the banner.
  useEffect(() => {
    if (!currentUserId) return

    async function nameFor(userId: string): Promise<string> {
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name')
        .eq('id', userId)
        .single()
      const row: { username: string; display_name: string | null } | null = data
      return row?.display_name ?? row?.username ?? 'Someone'
    }

    function show(name: string, preview: string) {
      setNotification({
        id: `friend-${Date.now()}`,
        conversationId: '',
        senderName: name,
        preview,
        kind: 'friend',
        onNavigate: () => friendsNavRef.current?.(),
      })
    }

    const channel = supabase
      .channel('friend-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'friendships' },
        (payload) => {
          const row = payload.new as { requester_id: string; recipient_id: string; status: string }
          if (row.status !== 'pending' || row.recipient_id !== currentUserId) return
          void nameFor(row.requester_id).then((name) => show(name, 'Sent you a friend request'))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'friendships' },
        (payload) => {
          const row = payload.new as { requester_id: string; recipient_id: string; status: string }
          // Only the original requester is told when a request is accepted; a
          // decline deletes the row and is deliberately silent.
          if (row.status !== 'accepted' || row.requester_id !== currentUserId) return
          void nameFor(row.recipient_id).then((name) => show(name, 'Accepted your friend request'))
        },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [currentUserId])

  const dismiss = useCallback(() => setNotification(null), [])

  return { notification, dismiss }
}
