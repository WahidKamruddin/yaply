import { useEffect, useRef, useCallback, useState } from 'react'
import { Phone, Video, Info, ChevronDown, ArrowLeft } from 'lucide-react'
import { useAtom } from 'jotai'
import { activeConversationIdAtom, replyToMessageIdAtom } from '@/features/chat/store/chat.atoms'
import { useConversations } from '@/features/chat/hooks/useConversations'
import { useMessages } from '@/features/chat/hooks/useMessages'
import { useSendMessage } from '@/features/chat/hooks/useSendMessage'
import { useRealtimeMessages } from '@/features/chat/hooks/useRealtimeMessages'
import { useEncryption } from '@/features/chat/hooks/useEncryption'
import { markConversationRead } from '@/features/chat/api/conversations'
import { deleteMessage } from '@/features/chat/api/messages'
import type { DecryptedMessage } from '@/features/chat/types'
import MessageBubble from './MessageBubble'
import MessageInput from './MessageInput'

interface Props {
  currentUserId: string
}

function DateSeparator({ date }: { date: string }) {
  const d = new Date(date)
  const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-[#dce7f8]" />
      <span className="text-xs text-[#9ab0cc] font-medium px-2">{label}</span>
      <div className="flex-1 h-px bg-[#dce7f8]" />
    </div>
  )
}

export default function ChatView({ currentUserId }: Props) {
  const [activeId, setActiveId] = useAtom(activeConversationIdAtom)
  const [replyId, setReplyId] = useAtom(replyToMessageIdAtom)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [decrypted, setDecrypted] = useState<DecryptedMessage[]>([])
  const [showMedia, setShowMedia] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: conversations = [] } = useConversations(currentUserId)
  const conversation = conversations.find((c) => c.id === activeId) ?? null
  const otherMember = conversation?.members.find((m) => m.userId !== currentUserId)

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(activeId)
  const { mutate: send } = useSendMessage(activeId ?? '')
  const { encrypt, decrypt } = useEncryption(currentUserId)

  useRealtimeMessages(activeId)

  const allDbMessages = (data?.pages ?? []).flatMap((p) => p.messages).reverse()
  const replyMessage = replyId ? decrypted.find((m) => m.id === replyId) : null

  // Decrypt messages whenever DB messages change
  useEffect(() => {
    if (!activeId || allDbMessages.length === 0) {
      setDecrypted([])
      return
    }

    async function decryptAll() {
      const results: DecryptedMessage[] = []
      for (const msg of allDbMessages) {
        let content = msg.encrypted_content
        const senderId = msg.sender_id
        if (senderId && senderId !== currentUserId) {
          try {
            content = await decrypt(activeId!, senderId, msg.encrypted_content)
          } catch {
            try { content = atob(msg.encrypted_content) } catch { /* keep raw */ }
          }
        } else {
          try { content = atob(msg.encrypted_content) } catch { /* keep raw */ }
        }
        results.push({
          id: msg.id,
          conversationId: msg.conversation_id,
          senderId: msg.sender_id,
          content,
          messageType: msg.message_type,
          contentHint: msg.content_hint,
          attachmentRef: msg.encrypted_attachment_ref,
          parentMessageId: msg.parent_message_id,
          threadName: msg.thread_name,
          deletedAt: msg.deleted_at,
          serverTimestamp: msg.server_timestamp,
          senderProfile: msg.sender_profile,
        })
      }
      setDecrypted(results)
    }

    void decryptAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDbMessages.length, activeId])

  // Mark as read when conversation opens
  useEffect(() => {
    if (!activeId) return
    void markConversationRead(activeId, currentUserId)
  }, [activeId, currentUserId])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [decrypted.length])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollBtn(distFromBottom > 300)

    if (el.scrollTop < 80 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const handleSend = useCallback(async (text: string) => {
    if (!activeId) return
    const targetUserId = otherMember?.userId
    let encrypted = btoa(text)
    if (targetUserId) {
      try { encrypted = await encrypt(activeId, targetUserId, text) } catch { /* fallback to base64 */ }
    }
    send({
      conversationId: activeId,
      senderId: currentUserId,
      encryptedContent: encrypted,
      messageType: 3,
      senderDeviceId: 1,
      parentMessageId: replyId,
    })
    setReplyId(null)
  }, [activeId, currentUserId, encrypt, otherMember?.userId, replyId, send, setReplyId])

  const handleDelete = useCallback(async (messageId: string) => {
    await deleteMessage(messageId)
  }, [])

  if (!activeId || !conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#edf1fa] text-[#9ab0cc]">
        <div className="w-16 h-16 rounded-full bg-white shadow-sm shadow-[#dce7f8] flex items-center justify-center mb-4">
          <Info size={28} strokeWidth={1.5} className="text-[#5b8def]/50" />
        </div>
        <p className="text-sm font-medium text-[#6b84ab]">Select a conversation</p>
        <p className="text-xs mt-1">Choose from the list on the left</p>
      </div>
    )
  }

  const displayName = conversation.isGroup
    ? (conversation.name ?? 'Group')
    : (otherMember?.profile.display_name ?? otherMember?.profile.username ?? 'Unknown')

  const avatarSrc = conversation.isGroup ? conversation.avatarUrl : otherMember?.profile.avatar_url
  const isOnline = !conversation.isGroup && (otherMember?.profile.is_online ?? false)

  // Group messages by date for separators
  let lastDate = ''

  return (
    <div className="flex-1 flex flex-col h-full bg-[#edf1fa] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#dce7f8] bg-white">
        <button onClick={() => setActiveId(null)} className="md:hidden text-[#9ab0cc] hover:text-[#1a2744] mr-1">
          <ArrowLeft size={20} />
        </button>
        <div className="relative flex-shrink-0 w-9 h-9">
          {avatarSrc ? (
            <img src={avatarSrc} alt={displayName} className="w-full h-full rounded-full object-cover" />
          ) : (
            <div className="w-full h-full rounded-full bg-[#5b8def] flex items-center justify-center text-white font-semibold text-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {!conversation.isGroup && (
            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${isOnline ? 'bg-green-500' : 'bg-[#b0c0d8]'}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#1a2744] truncate">{displayName}</p>
          <p className="text-xs text-[#9ab0cc]">{isOnline ? 'Online' : conversation.isGroup ? `${conversation.members.length} members` : 'Offline'}</p>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-8 h-8 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-[#5b8def] hover:bg-[#edf3ff] transition-colors">
            <Phone size={16} />
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-[#5b8def] hover:bg-[#edf3ff] transition-colors">
            <Video size={16} />
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-[#5b8def] hover:bg-[#edf3ff] transition-colors">
            <Info size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5"
      >
        {isFetchingNextPage && (
          <div className="text-center text-xs text-[#9ab0cc] py-2">Loading older messages...</div>
        )}
        {isLoading && (
          <div className="flex items-center justify-center h-24 text-[#9ab0cc] text-sm">Loading messages...</div>
        )}

        {decrypted.map((msg) => {
          const msgDate = new Date(msg.serverTimestamp).toDateString()
          const showSeparator = msgDate !== lastDate
          lastDate = msgDate

          return (
            <div key={msg.id}>
              {showSeparator && <DateSeparator date={msg.serverTimestamp} />}
              <MessageBubble
                message={msg}
                isOwn={msg.senderId === currentUserId}
                onReply={(id) => setReplyId(id)}
                onDelete={(id) => void handleDelete(id)}
              />
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom FAB */}
      {showScrollBtn && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-24 right-6 w-9 h-9 flex items-center justify-center rounded-full bg-[#5b8def] text-white shadow-lg hover:bg-[#4a7de4] transition-colors z-10"
        >
          <ChevronDown size={18} />
        </button>
      )}

      {/* Input */}
      <MessageInput
        onSend={(text) => void handleSend(text)}
        onAttachment={() => setShowMedia(true)}
        replyMessage={replyMessage}
        disabled={!activeId}
      />

      {/* Media picker placeholder */}
      {showMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowMedia(false)}>
          <div className="bg-white border border-[#dce7f8] rounded-2xl p-6 text-[#6b84ab] text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            Media picker (Phase 3)
          </div>
        </div>
      )}
    </div>
  )
}
