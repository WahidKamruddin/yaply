import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAtom } from 'jotai'
import { getUser, onAuthStateChange } from '@/lib/auth'
import ConversationList from '@/features/chat/components/ConversationList'
import ChatView from '@/features/chat/components/ChatView'
import CommandProvider from '@/features/commands/components/CommandProvider'
import DragDropZone from '@/features/media/components/DragDropZone'
import NotificationBanner from '@/features/notifications/components/NotificationBanner'
import { useInAppNotifications } from '@/features/notifications/hooks/useInAppNotifications'
import { useConversations } from '@/features/chat/hooks/useConversations'
import { usePresence } from '@/features/chat/hooks/usePresence'
import { usePushNotifications } from '@/features/chat/hooks/usePushNotifications'
import { activeConversationIdAtom } from '@/features/chat/store/chat.atoms'
import { uploadMediaFile } from '@/features/media/api/upload'
import { sendMessage } from '@/features/chat/api/messages'
import type { User } from '@supabase/supabase-js'

export const Route = createFileRoute('/chat')({
  beforeLoad: async () => {
    const user = await getUser()
    if (!user) throw redirect({ to: '/auth' })
  },
  component: ChatPage,
})

function ChatPage() {
  const [user, setUser] = useState<User | null>(null)
  const [activeConvId, setActiveId] = useAtom(activeConversationIdAtom)
  const navigate = useNavigate()

  const { data: conversations = [] } = useConversations(user?.id ?? '')
  const { notification, dismiss } = useInAppNotifications(
    user?.id ?? '',
    activeConvId,
    conversations,
    (convId) => setActiveId(convId),
  )

  usePresence(user?.id)
  usePushNotifications(user?.id)

  useEffect(() => {
    void getUser().then(setUser)

    const { data: listener } = onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session) {
        setActiveId(null)
        void navigate({ to: '/auth' })
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [navigate, setActiveId])

  const handleFileDrop = useCallback(
    async (file: File) => {
      if (!user || !activeConvId) return
      try {
        const { publicUrl } = await uploadMediaFile(file, user.id)
        await sendMessage({
          conversationId: activeConvId,
          senderId: user.id,
          content: '',
          iv: null,
          type: 'image',
          mediaUrl: publicUrl,
          mediaMime: file.type,
        })
      } catch {
        // upload failure is silent — user can retry via attachment button
      }
    },
    [activeConvId, user],
  )

  if (!user) return null

  return (
    <CommandProvider userId={user.id}>
      <NotificationBanner notification={notification} onDismiss={dismiss} />
      <DragDropZone
        onFileDrop={(file) => void handleFileDrop(file)}
        className="h-screen flex overflow-hidden"
      >
        <ConversationList currentUserId={user.id} userEmail={user.email ?? ''} className="w-72 flex-shrink-0" />
        <ChatView currentUserId={user.id} userEmail={user.email ?? ''} />
      </DragDropZone>
    </CommandProvider>
  )
}
