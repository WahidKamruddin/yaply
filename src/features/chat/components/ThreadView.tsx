import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Send, Link2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useEncryption, decryptV2Cached, decodePhase1 } from '@/features/chat/hooks/useEncryption'
import { fetchThreadMessages, sendMessage, editMessageWithEnvelopes } from '@/features/chat/api/messages'
import { supabase } from '@/lib/supabase'
import { useDecryptCacheVersion } from '@/features/chat/lib/decryptCache'
import type { DecryptedMessage, MemberSummary } from '@/features/chat/types'
import MessageBubble from './MessageBubble'
import { getGroupPositions } from '@/features/chat/lib/messageGrouping'
import { extractMentions } from '@yaply/shared/mentions'
import { extractFirstUrl, encodeTextMessage, decodeTextMessage } from '@yaply/shared/linkPreview'
import type { LinkPreview } from '@yaply/shared/linkPreview'

interface Props {
  rootMessage: DecryptedMessage
  currentUserId: string
  conversationId: string
  // Every member of the conversation — thread replies are envelope-encrypted
  // for all member devices, same as main messages, and (for groups) used to
  // resolve typed @mentions.
  members: MemberSummary[]
  // Sender names show on bubbles only in group chats.
  isGroup: boolean
  onClose: () => void
}

export default function ThreadView({ rootMessage, currentUserId, conversationId, members, isGroup, onClose }: Props) {
  const memberUserIds = members.map((m) => m.userId)
  const [replies, setReplies] = useState<DecryptedMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { encrypt } = useEncryption(currentUserId)
  const decryptCacheVersion = useDecryptCacheVersion()

  // Link preview — same debounced-resolve-then-seal flow as the main composer
  // (MessageInput.tsx). See CLAUDE.md's "Link previews" section.
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewDismissed, setPreviewDismissed] = useState(false)
  const lastResolvedUrlRef = useRef<string | null>(null)
  const previewRequestIdRef = useRef(0)
  // The in-flight fetch, if any — captured at send time and handed along
  // instead of cancelled, so a still-resolving preview can be attached after
  // the reply already sent. See CLAUDE.md's "Link previews" section.
  const previewPromiseRef = useRef<Promise<LinkPreview | null> | null>(null)
  const activePreview = previewDismissed ? null : linkPreview

  useEffect(() => {
    const url = extractFirstUrl(text)
    if (!url) {
      lastResolvedUrlRef.current = null
      setLinkPreview(null)
      setPreviewLoading(false)
      setPreviewDismissed(false)
      previewPromiseRef.current = null
      return
    }
    if (url === lastResolvedUrlRef.current) return

    lastResolvedUrlRef.current = url
    setPreviewDismissed(false)
    setPreviewLoading(true)
    const requestId = ++previewRequestIdRef.current

    let timer: ReturnType<typeof setTimeout>
    const promise = new Promise<LinkPreview | null>((resolve) => {
      timer = setTimeout(() => {
        void (async () => {
          let result: LinkPreview | null = null
          try {
            const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } })
            result = error || !data ? null : (data as LinkPreview)
          } catch {
            result = null
          }
          if (previewRequestIdRef.current === requestId) {
            setLinkPreview(result)
            setPreviewLoading(false)
          }
          resolve(result)
        })()
      }, 600)
    })
    previewPromiseRef.current = promise

    return () => clearTimeout(timer)
  }, [text])

  const loadReplies = useCallback(async () => {
    const raw = await fetchThreadMessages(rootMessage.id)

    // Shared plaintext cache; one batched envelope lookup for the misses.
    const v2Plain = await decryptV2Cached(currentUserId, raw.filter((m) => m.enc_v === 2))

    const decrypted: DecryptedMessage[] = []
    for (const msg of raw) {
      let content = msg.content
      let decryptFailed = false
      if (msg.enc_v === 2) {
        const plain = v2Plain.get(msg.id)
        if (plain == null) {
          decryptFailed = true
          content = ''
        } else {
          content = plain
        }
      } else if (!msg.iv) {
        // Phase-1 fallback / system messages: plain base64.
        content = decodePhase1(msg.content)
      } else {
        // Legacy pairwise ciphertext (pre-envelope-migration) — unreadable.
        decryptFailed = true
        content = ''
      }
      let msgLinkPreview: LinkPreview | undefined
      if (!decryptFailed && msg.type === 'text') {
        const decoded = decodeTextMessage(content)
        content = decoded.text
        msgLinkPreview = decoded.linkPreview
      }
      decrypted.push({
        id: msg.id,
        conversationId: msg.conversation_id,
        senderId: msg.sender_id,
        content,
        decryptFailed,
        type: msg.type,
        mediaUrl: msg.media_url,
        replyToId: msg.reply_to_id,
        threadId: msg.thread_id,
        editedAt: msg.edited_at,
        deletedAt: msg.deleted_at,
        createdAt: msg.created_at,
        senderProfile: msg.sender_profile,
        linkPreview: msgLinkPreview,
      })
    }
    setReplies(decrypted)
  }, [rootMessage.id, conversationId, currentUserId])

  // decryptCacheVersion: re-run after a pairing import makes failures retryable.
  useEffect(() => { void loadReplies() }, [loadReplies, decryptCacheVersion])

  useEffect(() => {
    const channel = supabase
      .channel(`thread:${rootMessage.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${rootMessage.id}`,
      }, () => { void loadReplies() })
      // Picks up a late-attached preview (or any future real edit) for
      // another open viewer of this thread — previously only INSERT
      // triggered a reload, so an edited reply never live-updated.
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${rootMessage.id}`,
      }, () => { void loadReplies() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [rootMessage.id, loadReplies])

  // Re-seals an already-sent reply once a preview still in flight at send
  // time resolves. Mirrors ChatView.attachLinkPreview. Silent no-op on
  // failure — matches today's behavior when a preview fails outright.
  const attachLinkPreview = useCallback(async (
    messageId: string,
    replyText: string,
    preview: LinkPreview,
  ) => {
    try {
      const result = await encrypt(memberUserIds, encodeTextMessage(replyText, preview))
      await editMessageWithEnvelopes(
        result.mode === 'v2'
          ? { messageId, content: result.content, iv: result.iv, envelopes: result.envelopes }
          : { messageId, content: result.content, iv: null },
      )
      await loadReplies()
    } catch (err) {
      console.error('[yaply] failed to attach a late-resolved link preview', err)
    }
  }, [encrypt, memberUserIds, loadReplies])

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    // Never block sending on the fetch: seal in whatever's already resolved;
    // if one's still in flight, hand its promise along instead of cancelling.
    const resolvedPreview = activePreview ?? undefined
    const latePreview = resolvedPreview || !previewLoading ? undefined : (previewPromiseRef.current ?? undefined)
    setSending(true)
    setText('')
    setLinkPreview(null)
    setPreviewDismissed(false)
    setPreviewLoading(false)
    lastResolvedUrlRef.current = null
    previewRequestIdRef.current++
    previewPromiseRef.current = null

    setSendError(null)
    try {
      // Envelope-encrypt for all member devices; encrypt() falls back to
      // phase-1 (enc_v = NULL, iv = NULL) when a member has no device yet.
      // The link preview is sealed alongside the text, same as the main
      // composer (ChatView.handleSend) — see CLAUDE.md's "Link previews".
      const result = await encrypt(memberUserIds, encodeTextMessage(trimmed, resolvedPreview))
      // Same plaintext-before-encryption extraction as the main composer
      // (ChatView.handleSend) — see CLAUDE.md's mentions section.
      const { mentionedUserIds, mentionsEveryone } = isGroup
        ? extractMentions(
            trimmed,
            members.map((m) => ({ userId: m.userId, username: m.profile.username })),
            currentUserId,
          )
        : { mentionedUserIds: [], mentionsEveryone: false }
      const sent = await sendMessage({
        conversationId,
        senderId: currentUserId,
        content: result.content,
        iv: result.mode === 'v2' ? result.iv : null,
        envelopes: result.mode === 'v2' ? result.envelopes : undefined,
        type: 'text',
        replyToId: rootMessage.id,
        threadId: rootMessage.id,
        mentionedUserIds,
        mentionsEveryone,
      })
      if (!resolvedPreview && latePreview) {
        void latePreview.then((resolved) => {
          if (resolved) void attachLinkPreview(sent.id, trimmed, resolved)
        })
      }
      await loadReplies()
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send')
    }

    setSending(false)
  }, [text, sending, rootMessage, conversationId, currentUserId, memberUserIds, members, isGroup, encrypt, loadReplies, activePreview, previewLoading, attachLinkPreview])

  const rootName = rootMessage.senderProfile?.display_name ?? rootMessage.senderProfile?.username ?? 'Deleted user'
  const rootTime = formatDistanceToNow(new Date(rootMessage.createdAt), { addSuffix: true })
  const replyPositions = getGroupPositions(replies)

  function replyMessageFor(msg: DecryptedMessage): DecryptedMessage | null {
    if (!msg.replyToId) return null
    if (msg.replyToId === rootMessage.id) return null
    return replies.find(r => r.id === msg.replyToId) ?? null
  }

  return (
    <div className="absolute inset-0 z-20 flex pointer-events-none">
      {/* Blur backdrop — clickable to close */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto cursor-pointer"
        onClick={onClose}
      />

      {/* Thread panel */}
      <div className="absolute right-0 top-0 bottom-0 w-[400px] bg-card shadow-2xl flex flex-col pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-text">Thread</h3>
            <p className="text-xs text-text-subtle">
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-tint transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Root message */}
        <div className="px-3 pt-4 pb-3 border-b border-border bg-tint flex-shrink-0">
          <p className="text-[10px] text-text-subtle font-medium mb-1 px-1">
            {rootName} · {rootTime}
          </p>
          <MessageBubble
            message={rootMessage}
            isOwn={rootMessage.senderId === currentUserId}
            currentUserId={currentUserId}
            showSenderName={isGroup}
            mentionMembers={isGroup ? members : undefined}
            onReply={() => {}}
            onDelete={() => {}}
          />
        </div>

        {/* Replies */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {replies.length === 0 ? (
            <p className="text-center text-xs text-text-subtle py-8">
              No replies yet — start the thread!
            </p>
          ) : (
            replies.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.senderId === currentUserId}
                currentUserId={currentUserId}
                replyMessage={replyMessageFor(msg)}
                groupPosition={replyPositions[i]}
                showSenderName={isGroup}
                mentionMembers={isGroup ? members : undefined}
                onReply={() => {}}
                onDelete={() => {}}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border px-4 py-3 flex-shrink-0">
          {sendError && (
            <p className="text-xs text-red-400 mb-2 px-1">{sendError}</p>
          )}
          {(previewLoading || activePreview) && (
            <div className="flex items-center justify-between gap-2 mb-2 px-2 py-1.5 bg-tint rounded-lg border border-border">
              <div className="flex items-center gap-2 min-w-0">
                {activePreview?.imageUrl ? (
                  <img src={activePreview.imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <Link2 size={14} className="text-text-subtle flex-shrink-0" />
                )}
                <p className="text-xs font-medium text-primary-text truncate">
                  {previewLoading && !activePreview ? 'Fetching preview…' : activePreview?.title || activePreview?.url}
                </p>
              </div>
              <button
                onClick={() => setPreviewDismissed(true)}
                aria-label="Remove link preview"
                className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-card transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() } }}
              placeholder="Reply in thread…"
              rows={1}
              disabled={sending}
              className="flex-1 resize-none bg-tint rounded-2xl px-4 py-2.5 text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-primary/40 max-h-32 leading-relaxed disabled:opacity-50"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!text.trim() || sending}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-primary hover:bg-primary-dark text-white disabled:opacity-40 transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
