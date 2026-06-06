import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Send } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useEncryption } from '@/features/chat/hooks/useEncryption'
import { fetchThreadMessages, sendMessage } from '@/features/chat/api/messages'
import { supabase } from '@/lib/supabase'
import type { DecryptedMessage } from '@/features/chat/types'
import MessageBubble from './MessageBubble'

interface Props {
  rootMessage: DecryptedMessage
  currentUserId: string
  conversationId: string
  onClose: () => void
}

export default function ThreadView({ rootMessage, currentUserId, conversationId, onClose }: Props) {
  const [replies, setReplies] = useState<DecryptedMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { encrypt, decrypt } = useEncryption(currentUserId)

  const loadReplies = useCallback(async () => {
    const raw = await fetchThreadMessages(rootMessage.id)
    const decrypted: DecryptedMessage[] = []
    for (const msg of raw) {
      let content = msg.content
      if (msg.sender_id && msg.sender_id !== currentUserId) {
        try { content = await decrypt(conversationId, msg.sender_id, msg.content, msg.iv) }
        catch { try { content = atob(msg.content) } catch { /* keep raw */ } }
      } else {
        try { content = msg.iv ? msg.content : atob(msg.content) } catch { /* keep raw */ }
      }
      decrypted.push({
        id: msg.id,
        conversationId: msg.conversation_id,
        senderId: msg.sender_id,
        content,
        type: msg.type,
        mediaUrl: msg.media_url,
        replyToId: msg.reply_to_id,
        threadId: msg.thread_id,
        editedAt: msg.edited_at,
        deletedAt: msg.deleted_at,
        createdAt: msg.created_at,
        senderProfile: msg.sender_profile,
      })
    }
    setReplies(decrypted)
  }, [rootMessage.id, conversationId, currentUserId, decrypt])

  useEffect(() => { void loadReplies() }, [loadReplies])

  useEffect(() => {
    const channel = supabase
      .channel(`thread:${rootMessage.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${rootMessage.id}`,
      }, () => { void loadReplies() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [rootMessage.id, loadReplies])

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')

    const otherUserId = replies.find(r => r.senderId && r.senderId !== currentUserId)?.senderId
      ?? (rootMessage.senderId && rootMessage.senderId !== currentUserId ? rootMessage.senderId : null)

    setSendError(null)
    try {
      let content = trimmed
      let iv: string | null = null
      if (otherUserId) {
        const enc = await encrypt(conversationId, otherUserId, trimmed)
        content = enc.content
        iv = enc.iv || null
      } else {
        // Use TextEncoder + base64 so non-ASCII (emoji, etc.) don't crash btoa
        content = btoa(String.fromCharCode(...new TextEncoder().encode(trimmed)))
      }

      await sendMessage({
        conversationId,
        senderId: currentUserId,
        content,
        iv,
        type: 'text',
        replyToId: rootMessage.id,
        threadId: rootMessage.id,
      })
      await loadReplies()
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send')
    }

    setSending(false)
  }, [text, sending, replies, rootMessage, conversationId, currentUserId, encrypt, loadReplies])

  const rootName = rootMessage.senderProfile?.display_name ?? rootMessage.senderProfile?.username ?? 'Unknown'
  const rootTime = formatDistanceToNow(new Date(rootMessage.createdAt), { addSuffix: true })

  function replyMessageFor(msg: DecryptedMessage): DecryptedMessage | null {
    if (!msg.replyToId) return null
    if (msg.replyToId === rootMessage.id) return null
    return replies.find(r => r.id === msg.replyToId) ?? null
  }

  return (
    <div className="absolute inset-0 z-20 flex pointer-events-none">
      {/* Blur backdrop — clickable to close */}
      <div
        className="absolute inset-0 bg-[#1a2744]/20 backdrop-blur-sm pointer-events-auto cursor-pointer"
        onClick={onClose}
      />

      {/* Thread panel */}
      <div className="absolute right-0 top-0 bottom-0 w-[400px] bg-white shadow-2xl flex flex-col pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#dce7f8] flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-[#1a2744]">Thread</h3>
            <p className="text-xs text-[#9ab0cc]">
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-[#1a2744] hover:bg-[#edf1fa] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Root message */}
        <div className="px-3 pt-4 pb-3 border-b border-[#dce7f8] bg-[#f8faff] flex-shrink-0">
          <p className="text-[10px] text-[#9ab0cc] font-medium mb-1 px-1">
            {rootName} · {rootTime}
          </p>
          <MessageBubble
            message={rootMessage}
            isOwn={rootMessage.senderId === currentUserId}
            onReply={() => {}}
            onDelete={() => {}}
          />
        </div>

        {/* Replies */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {replies.length === 0 ? (
            <p className="text-center text-xs text-[#9ab0cc] py-8">
              No replies yet — start the thread!
            </p>
          ) : (
            replies.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.senderId === currentUserId}
                replyMessage={replyMessageFor(msg)}
                onReply={() => {}}
                onDelete={() => {}}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[#dce7f8] px-4 py-3 flex-shrink-0">
          {sendError && (
            <p className="text-xs text-red-400 mb-2 px-1">{sendError}</p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() } }}
              placeholder="Reply in thread…"
              rows={1}
              disabled={sending}
              className="flex-1 resize-none bg-[#f3f7ff] rounded-2xl px-4 py-2.5 text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40 max-h-32 leading-relaxed disabled:opacity-50"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!text.trim() || sending}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-[#5b8def] hover:bg-[#4a7de4] text-white disabled:opacity-40 transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
