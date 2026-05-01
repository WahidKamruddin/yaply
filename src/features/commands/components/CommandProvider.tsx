import { useEffect, useState, useCallback } from 'react'
import { useAtomValue } from 'jotai'
import { activeConversationIdAtom } from '@/features/chat/store/chat.atoms'
import { useConversations } from '@/features/chat/hooks/useConversations'
import { sendMessage } from '@/features/chat/api/messages'
import { executeCommand } from '../commandRegistry'
import CommandModal from './CommandModal'
import type { CreateItemType } from '../handlers/createHandler'

interface YaplyCommandEvent {
  name: string
  args: string[]
  rawArgs: string
  conversationId?: string
}

interface Props {
  userId: string
  children: React.ReactNode
}

export default function CommandProvider({ userId, children }: Props) {
  const activeConvId = useAtomValue(activeConversationIdAtom)
  const { data: conversations = [] } = useConversations(userId)
  const [modalType, setModalType] = useState<CreateItemType | null>(null)
  const [modalTitle, setModalTitle] = useState('')

  const sendSystemMessage = useCallback(
    async (text: string) => {
      const convId = activeConvId
      if (!convId) return
      await sendMessage({
        conversationId: convId,
        senderId: userId,
        encryptedContent: btoa(text),
        messageType: 3,
        senderDeviceId: 1,
        contentHint: 'system',
      })
    },
    [activeConvId, userId],
  )

  const openModal = useCallback((type: CreateItemType, title?: string) => {
    setModalType(type)
    setModalTitle(title ?? '')
  }, [])

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<YaplyCommandEvent>).detail
      const convId = detail.conversationId ?? activeConvId
      if (!convId) return

      const conversation = conversations.find((c) => c.id === convId)
      const members = conversation?.members ?? []

      void executeCommand(detail.name, {
        conversationId: convId,
        userId,
        args: detail.args,
        rawArgs: detail.rawArgs,
        members,
        openModal,
        sendSystemMessage,
      })
    }

    window.addEventListener('yaply:command', handler)
    return () => window.removeEventListener('yaply:command', handler)
  }, [activeConvId, conversations, openModal, sendSystemMessage, userId])

  return (
    <>
      {children}
      {modalType && activeConvId && (
        <CommandModal
          type={modalType}
          initialTitle={modalTitle}
          conversationId={activeConvId}
          userId={userId}
          onClose={() => setModalType(null)}
          onCreated={(msg) => { void sendSystemMessage(msg); setModalType(null) }}
        />
      )}
    </>
  )
}
