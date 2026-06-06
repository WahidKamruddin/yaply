import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { InAppNotification } from '@/features/notifications/components/NotificationBanner'
import type { ConversationListItem } from '@/features/chat/types'

export function useInAppNotifications(
  currentUserId: string,
  activeConversationId: string | null,
  conversations: ConversationListItem[],
  onNavigate: (conversationId: string) => void,
) {
  const [notification, setNotification] = useState<InAppNotification | null>(null)
  const activeIdRef = useRef(activeConversationId)
  const navigateRef = useRef(onNavigate)

  useEffect(() => { activeIdRef.current = activeConversationId }, [activeConversationId])
  useEffect(() => { navigateRef.current = onNavigate }, [onNavigate])

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

          const sender = conv.members.find((m) => m.userId === msg.sender_id)
          const senderName =
            sender?.profile.display_name ?? sender?.profile.username ?? 'Someone'

          const convId = msg.conversation_id
          setNotification({
            id: `${convId}-${Date.now()}`,
            conversationId: convId,
            senderName,
            preview: msg.type === 'text' ? 'Sent a message' : `Sent a ${msg.type}`,
            onNavigate: () => navigateRef.current(convId),
          })
        },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [currentUserId, conversations])

  const dismiss = useCallback(() => setNotification(null), [])

  return { notification, dismiss }
}
