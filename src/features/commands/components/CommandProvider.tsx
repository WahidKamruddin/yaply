import { useEffect, useState, useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { useQueryClient } from '@tanstack/react-query'
import { activeConversationIdAtom, commandFeedbackAtom } from '@/features/chat/store/chat.atoms'
import { useConversations } from '@/features/chat/hooks/useConversations'
import { executeCommand } from '../commandRegistry'
import CommandModal from './CommandModal'
import HelpModal from './HelpModal'
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
  const [helpOpen, setHelpOpen] = useState(false)
  const setFeedback = useSetAtom(commandFeedbackAtom)
  const queryClient = useQueryClient()

  const showLocalFeedback = useCallback(
    (text: string) => setFeedback(text),
    [setFeedback],
  )

  const openHelp = useCallback(() => setHelpOpen(true), [])

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
        queryClient,
        openModal,
        openHelp,
        showLocalFeedback,
      })
    }

    window.addEventListener('yaply:command', handler)
    return () => window.removeEventListener('yaply:command', handler)
  }, [activeConvId, conversations, openHelp, openModal, showLocalFeedback, userId])

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
          onCreated={() => setModalType(null)}
        />
      )}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </>
  )
}
