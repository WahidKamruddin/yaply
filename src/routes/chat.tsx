import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { getUser, onAuthStateChange } from '@/lib/auth'
import ConversationList from '@/features/chat/components/ConversationList'
import ChatView from '@/features/chat/components/ChatView'
import CommandProvider from '@/features/commands/components/CommandProvider'
import DragDropZone from '@/features/media/components/DragDropZone'
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
  const [, setActiveId] = useAtom(activeConversationIdAtom)
  const activeConvId = useAtomValue(activeConversationIdAtom)
  const navigate = useNavigate()

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
          encryptedContent: btoa(publicUrl),
          messageType: 3,
          senderDeviceId: 1,
          contentHint: 'media',
          encryptedAttachmentRef: publicUrl,
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
      <DragDropZone
        onFileDrop={(file) => void handleFileDrop(file)}
        className="h-screen flex overflow-hidden"
      >
        <ConversationList currentUserId={user.id} className="w-72 flex-shrink-0" />
        <ChatView currentUserId={user.id} />
      </DragDropZone>
    </CommandProvider>
  )
}
