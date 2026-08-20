import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAtom } from 'jotai'
import { getSession, getUser, onAuthStateChange } from '@/lib/auth'
import ConversationList from '@/features/chat/components/ConversationList'
import ChatView from '@/features/chat/components/ChatView'
import UsernameSetupModal from '@/features/chat/components/UsernameSetupModal'
import CommandProvider from '@/features/commands/components/CommandProvider'
import { useProfile } from '@/features/chat/hooks/useProfile'
import DragDropZone from '@/features/media/components/DragDropZone'
import NotificationBanner from '@/features/notifications/components/NotificationBanner'
import { useInAppNotifications } from '@/features/notifications/hooks/useInAppNotifications'
import { useConversations } from '@/features/chat/hooks/useConversations'
import { usePresence } from '@/features/chat/hooks/usePresence'
import { usePushNotifications } from '@/features/chat/hooks/usePushNotifications'
import { useDeviceRevocation } from '@/features/pairing/hooks/useDeviceRevocation'
import { activeConversationIdAtom } from '@/features/chat/store/chat.atoms'
import { uploadMediaFile } from '@/features/media/api/upload'
import { sendMessage } from '@/features/chat/api/messages'
import LoadingScreen from '@/components/LoadingScreen'
import type { User } from '@supabase/supabase-js'

export const Route = createFileRoute('/chat')({
  beforeLoad: async () => {
    if (typeof document === 'undefined') return // SSR — no localStorage, client handles it
    const session = await getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: ChatPage,
})

function ChatPage() {
  const [user, setUser] = useState<User | null>(null)
  const [activeConvId, setActiveId] = useAtom(activeConversationIdAtom)
  const navigate = useNavigate()

  const { data: conversations = [] } = useConversations(user?.id ?? '')
  const { data: profile } = useProfile(user?.id ?? '')
  const { notification, dismiss } = useInAppNotifications(
    user?.id ?? '',
    activeConvId,
    conversations,
    (convId) => setActiveId(convId),
    () => void navigate({ to: '/friends' }),
  )

  usePresence(user?.id)
  usePushNotifications(user?.id)
  // Signs this install out the moment it's revoked from another device,
  // rather than waiting out its access token.
  useDeviceRevocation(user?.id)

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

  if (!user) return <LoadingScreen />

  return (
    <CommandProvider userId={user.id}>
      {profile && !profile.username_set && (
        <UsernameSetupModal userId={user.id} suggestedUsername={profile.username} />
      )}
      <NotificationBanner notification={notification} onDismiss={dismiss} />
      <DragDropZone
        onFileDrop={(file) => void handleFileDrop(file)}
        className="h-[100dvh] flex overflow-hidden"
      >
        {/* Sidebar: full-screen on mobile when no chat is open; fixed 288px column on ≥ md.
            Drag-to-resize (useSidebarWidth) is temporarily disabled — wiring it up broke
            the desktop layout (the wrapper kept `w-full` at the md breakpoint with no
            override, collapsing the chat pane to zero width). The hook is kept in
            src/features/chat/hooks/useSidebarWidth.ts for a future retry. */}
        <div className={`flex-col h-full w-full md:w-72 md:flex-shrink-0 ${activeConvId ? 'hidden md:flex' : 'flex'}`}>
          <ConversationList currentUserId={user.id} />
        </div>

        {/* Chat: full-screen on mobile when a conversation is open; flex-1 column on ≥ md */}
        <div className={`flex-1 min-w-0 overflow-hidden ${activeConvId ? 'flex' : 'hidden md:flex'}`}>
          <ChatView currentUserId={user.id} />
        </div>
      </DragDropZone>
    </CommandProvider>
  )
}
