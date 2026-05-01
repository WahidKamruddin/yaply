import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { supabase } from '@/lib/supabase'
import ConversationList from '@/features/chat/components/ConversationList'
import ChatView from '@/features/chat/components/ChatView'
import CommandProvider from '@/features/commands/components/CommandProvider'
import DragDropZone from '@/features/media/components/DragDropZone'
import { activeConversationIdAtom } from '@/features/chat/store/chat.atoms'
import { uploadMediaFile } from '@/features/media/api/upload'
import { sendMessage } from '@/features/chat/api/messages'
import type { User } from '@supabase/supabase-js'

export const Route = createFileRoute('/chat')({ component: ChatPage })

function ChatPage() {
  const [user, setUser] = useState<User | null>(null)
  const [, setActiveId] = useAtom(activeConversationIdAtom)
  const activeConvId = useAtomValue(activeConversationIdAtom)

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUser(data.user))

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session) setActiveId(null)
    })

    return () => listener.subscription.unsubscribe()
  }, [setActiveId])

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

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f172a]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center mx-auto mb-4">
            <span className="text-black font-bold text-2xl">y</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-2">yaply</h1>
          <p className="text-slate-500 text-sm">Please sign in to continue</p>
        </div>
      </div>
    )
  }

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
