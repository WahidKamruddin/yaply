import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Phone, Video, ChevronDown, ArrowLeft, Search, X, PanelRight, ChevronRight } from 'lucide-react'
import { useAtom, useSetAtom } from 'jotai'
import { activeConversationIdAtom, replyToMessageIdAtom, conversationPanelOpenAtom, conversationPanelTabAtom, sidebarCollapsedAtom } from '@/features/chat/store/chat.atoms'
import { useConversations } from '@/features/chat/hooks/useConversations'
import { useMessages } from '@/features/chat/hooks/useMessages'
import { useSendMessage } from '@/features/chat/hooks/useSendMessage'
import { useRealtimeMessages } from '@/features/chat/hooks/useRealtimeMessages'
import { usePins, useTogglePin } from '@/features/chat/hooks/usePins'
import { useTypingIndicator } from '@/features/chat/hooks/useTypingIndicator'
import { useEncryption, getCandidateFingerprints, decodePhase1 } from '@/features/chat/hooks/useEncryption'
import type { DbEnvelope } from '@/features/chat/hooks/useEncryption'
import { useProfile } from '@/features/chat/hooks/useProfile'
import { markConversationRead } from '@/features/chat/api/conversations'
import { deleteMessage, fetchThreadCounts, fetchEnvelopesForMessages } from '@/features/chat/api/messages'
import { useReadReceipts } from '@/features/chat/hooks/useReadReceipts'
import GroupInfoModal from './GroupInfoModal'
import DmSettingsModal from './DmSettingsModal'
import ConversationPanel from './ConversationPanel'
import { useReminderNotifications } from '@/features/chat/hooks/useReminders'
import {
  fetchReactions,
  buildReactionGroups,
  addReaction,
  removeReaction,
  type ReactionGroup,
} from '@/features/chat/api/reactions'
import { uploadMediaFile, uploadRawFile } from '@/features/media/api/upload'
import type { GifResult } from '@/features/media/api/gifs'
import { supabase } from '@/lib/supabase'
import type { DecryptedMessage, ConversationListItem } from '@/features/chat/types'
import MessageBubble from './MessageBubble'
import MessageInput from './MessageInput'
import VoiceRecorderBar from './VoiceRecorderBar'
import PinnedBanner from './PinnedBanner'
import Avatar from '@/components/Avatar'
import ExpressionPicker from '@/features/media/components/ExpressionPicker'
import ThreadView from './ThreadView'
import Dashboard from './dashboard/Dashboard'
import MessageRequestBar from '@/features/friends/components/MessageRequestBar'

interface Props {
  currentUserId: string
}

function DateSeparator({ date }: { date: string }) {
  const d = new Date(date)
  const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-text-subtle font-medium px-2">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

export default function ChatView({ currentUserId }: Props) {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useAtom(activeConversationIdAtom)
  const [replyId, setReplyId] = useAtom(replyToMessageIdAtom)
  const [panelOpen, setPanelOpen] = useAtom(conversationPanelOpenAtom)
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom)
  const setPanelTab = useSetAtom(conversationPanelTabAtom)

  // Switching conversations or closing the chat (activeId -> null) should
  // never leave a reply from the previous conversation armed.
  useEffect(() => { setReplyId(null) }, [activeId, setReplyId])

  useReminderNotifications(currentUserId)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [newMsgCount, setNewMsgCount] = useState(0)
  const [decrypted, setDecrypted] = useState<DecryptedMessage[]>([])
  const [reactionsMap, setReactionsMap] = useState<Record<string, ReactionGroup[]>>({})
  const [showExpression, setShowExpression] = useState(false)
  const [recordingVoice, setRecordingVoice] = useState(false)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [pendingMessages, setPendingMessages] = useState<DecryptedMessage[]>([])
  const [preAnimIds, setPreAnimIds] = useState<Set<string>>(new Set())
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set())
  const [threadViewRoot, setThreadViewRoot] = useState<DecryptedMessage | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showChatSettings, setShowChatSettings] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const { data: currentUserProfile } = useProfile(currentUserId)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialScrollRef = useRef(true)
  const isNearBottomRef = useRef(true)
  const decryptedIdsRef = useRef<string[]>([])
  // Maps tempId → realId so pending messages are removed only once the real message lands in decrypted
  const pendingConfirmedRef = useRef<Map<string, string>>(new Map())
  // Per-conversation plaintext cache so new messages don't re-decrypt the whole
  // history. null = decryption failed for that message.
  const decryptCacheRef = useRef<Map<string, string | null>>(new Map())

  const { data: conversations = [] } = useConversations(currentUserId)
  const conversation = conversations.find((c) => c.id === activeId) ?? null
  const otherMember = conversation?.members.find((m) => m.userId !== currentUserId)
  // The other member's profile row is dropped by fetchConversations when their account was
  // deleted — conversation_members cascades but the conversation itself survives so the
  // remaining user keeps their message history.
  const isOrphanedDM = !!conversation && !conversation.isGroup && !otherMember
  // A DM from a non-friend: readable, but the composer is replaced by
  // accept/decline until this member row is accepted.
  const isMessageRequest = conversation?.requestState === 'pending'

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(activeId)
  const { mutate: send } = useSendMessage(activeId ?? '')
  const { encrypt, decryptV2 } = useEncryption(currentUserId)

  useRealtimeMessages(activeId)

  const { data: pins = [] } = usePins(activeId)
  const pinSet = useMemo(() => new Set(pins), [pins])
  const { mutate: mutatePin } = useTogglePin(activeId ?? '', currentUserId)
  const togglePin = useCallback(
    (messageId: string) => mutatePin({ messageId, pinned: pinSet.has(messageId) }),
    [mutatePin, pinSet],
  )

  const currentUsername = currentUserProfile?.display_name ?? currentUserProfile?.username ?? 'You'
  const { typingUsers, notifyTyping, notifyStopTyping } = useTypingIndicator(activeId, currentUserId, currentUsername)
  const typingProfile = typingUsers.length > 0
    ? conversation?.members.find((m) => m.profile.username === typingUsers[0])?.profile ?? null
    : null

  const allDbMessages = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.messages).reverse(),
    [data],
  )
  const replyMessage = replyId ? decrypted.find((m) => m.id === replyId) : null

  const readByOtherSet = useReadReceipts(activeId, currentUserId, decrypted)

  // Pending IDs for optimistic-update styling
  const pendingIdSet = useMemo(() => new Set(pendingMessages.map((m) => m.id)), [pendingMessages])

  // Clear all pending and reset initial-scroll flag when switching conversations
  useEffect(() => {
    setPendingMessages([])
    pendingConfirmedRef.current.clear()
    decryptCacheRef.current.clear()
    initialScrollRef.current = true
    isNearBottomRef.current = true
    setNewMsgCount(0)
  }, [activeId])

  const allMessages = useMemo(() => [...decrypted, ...pendingMessages], [decrypted, pendingMessages])

  const displayMessages = useMemo(() => {
    if (!searchQuery.trim()) return allMessages
    const q = searchQuery.toLowerCase()
    return allMessages.filter((m) => m.content.toLowerCase().includes(q))
  }, [allMessages, searchQuery])

  const lastOwnMessageId = useMemo(() => {
    const own = displayMessages.filter((m) => m.senderId === currentUserId && !m.deletedAt)
    return own.at(-1)?.id ?? null
  }, [displayMessages, currentUserId])

  // Fetch thread reply counts from DB (separate from main messages since those are filtered to thread_id IS NULL)
  const { data: threadCounts = {} } = useQuery({
    queryKey: ['thread-counts', activeId],
    queryFn: () => fetchThreadCounts(activeId!),
    enabled: !!activeId,
    staleTime: 30_000,
  })

  // Decrypt messages + load reactions whenever DB messages change
  useEffect(() => {
    if (!activeId || allDbMessages.length === 0) {
      setDecrypted([])
      setReactionsMap({})
      decryptedIdsRef.current = []
      return
    }

    const abort = { current: false }
    const isAborted = () => abort.current

    async function run() {
      const results: DecryptedMessage[] = []

      // Batch-fetch this device's envelopes for every not-yet-decrypted
      // enc_v = 2 message on the page (one query, keyed by fingerprint).
      const cacheKeyFor = (m: typeof allDbMessages[number]) => `${m.id}:${m.edited_at ?? ''}`
      const v2Ids = allDbMessages
        .filter((m) => m.enc_v === 2 && decryptCacheRef.current.get(cacheKeyFor(m)) === undefined)
        .map((m) => m.id)
      let envelopes: Map<string, DbEnvelope> = new Map()
      if (v2Ids.length > 0) {
        try {
          const fps = await getCandidateFingerprints(currentUserId)
          if (fps.length > 0) envelopes = await fetchEnvelopesForMessages(v2Ids, fps)
          console.debug('[yaply:crypto] ChatView envelope batch', { requested: v2Ids.length, found: envelopes.size })
        } catch (err) {
          console.error('[yaply:crypto] ChatView envelope batch FAILED', { err })
        }
      }
      if (isAborted()) return

      for (const msg of allDbMessages) {
        let content = msg.content
        let decryptFailed = false
        const cacheKey = cacheKeyFor(msg)
        const cachedPlain = decryptCacheRef.current.get(cacheKey)

        if (cachedPlain !== undefined) {
          if (cachedPlain === null) {
            decryptFailed = true
            content = ''
          } else {
            content = cachedPlain
          }
        } else if (msg.enc_v === 2) {
          // Envelope-encrypted (v2) — identical for groups and DMs. A missing
          // envelope means the message was sealed before this device existed.
          try {
            content = await decryptV2(envelopes.get(msg.id), msg.content, msg.iv)
            decryptCacheRef.current.set(cacheKey, content)
            console.debug('[yaply:crypto] ChatView v2 decrypt ok', { msgId: msg.id })
          } catch (err) {
            console.error('[yaply:crypto] ChatView v2 decrypt FAILED', { msgId: msg.id, hadEnvelope: envelopes.has(msg.id), err })
            decryptFailed = true
            content = ''
            decryptCacheRef.current.set(cacheKey, null)
          }
        } else if (!msg.iv) {
          // Phase-1 / system messages: content is plain base64.
          content = decodePhase1(msg.content)
          decryptCacheRef.current.set(cacheKey, content)
        } else {
          // iv set but not v2: legacy pairwise ciphertext from before the
          // envelope migration — unreadable by design (history was wiped).
          console.debug('[yaply:crypto] ChatView: legacy pairwise ciphertext, rendering decryptFailed', { msgId: msg.id })
          decryptFailed = true
          content = ''
          decryptCacheRef.current.set(cacheKey, null)
        }
        results.push({
          id: msg.id,
          conversationId: msg.conversation_id,
          senderId: msg.sender_id,
          content,
          decryptFailed,
          type: msg.type,
          mediaUrl: msg.media_url,
          mediaMime: msg.media_mime,
          replyToId: msg.reply_to_id,
          threadId: msg.thread_id,
          editedAt: msg.edited_at,
          deletedAt: msg.deleted_at,
          createdAt: msg.created_at,
          senderProfile: msg.sender_profile,
        })
      }
      if (isAborted()) return
      setDecrypted(results)
      decryptedIdsRef.current = results.map((m) => m.id)

      // Remove pending messages whose real counterpart has arrived in decrypted
      if (pendingConfirmedRef.current.size > 0) {
        const realIds = new Set(results.map((m) => m.id))
        const toRemove = new Set<string>()
        pendingConfirmedRef.current.forEach((realId, tempId) => {
          if (realIds.has(realId)) {
            toRemove.add(tempId)
            pendingConfirmedRef.current.delete(tempId)
          }
        })
        if (toRemove.size > 0) {
          setPendingMessages((prev) => prev.filter((m) => !toRemove.has(m.id)))
        }
      }

      const raw = await fetchReactions(decryptedIdsRef.current)
      if (isAborted()) return
      setReactionsMap(buildReactionGroups(raw, currentUserId))
    }

    void run()
    return () => { abort.current = true }
  }, [allDbMessages, activeId, currentUserId, decryptV2])

  // Realtime reactions subscription
  useEffect(() => {
    if (!activeId) return
    const channel = supabase
      .channel(`reactions:${activeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, async () => {
        if (decryptedIdsRef.current.length) {
          const raw = await fetchReactions(decryptedIdsRef.current)
          setReactionsMap(buildReactionGroups(raw, currentUserId))
        }
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [activeId, currentUserId])

  // Mark as read when the conversation opens, and again whenever a new
  // message arrives while it's still the active one — otherwise last_read_at
  // only advances at the moment you opened it, so anything that arrived
  // while you were actively looking at the conversation would count as
  // unread again the instant you switched away. The badge is cleared
  // immediately via an optimistic cache update — waiting on the server
  // round-trip (and a 30s-stale-time refetch) made the sidebar badge look
  // stuck even when the read state was fine. Errors are now surfaced
  // instead of silently swallowed by an unhandled rejection.
  useEffect(() => {
    if (!activeId) return
    queryClient.setQueryData<ConversationListItem[]>(['conversations', currentUserId], (prev) =>
      prev?.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c)),
    )
    markConversationRead(activeId, currentUserId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['conversations', currentUserId] })
      })
      .catch((err: unknown) => {
        console.error('[yaply] failed to mark conversation read', err)
      })
  }, [activeId, currentUserId, queryClient, allDbMessages.length])

  // Scroll to show typing indicator when it appears and user is near bottom
  useEffect(() => {
    if (typingUsers.length > 0 && isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [typingUsers.length])

  // Scroll logic: instant on initial load, proximity-based for other users' messages
  useEffect(() => {
    if (allMessages.length === 0) return

    if (initialScrollRef.current) {
      initialScrollRef.current = false
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
      return
    }

    const lastMsg = allMessages[allMessages.length - 1]
    if (lastMsg?.senderId === currentUserId) return

    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setNewMsgCount((c) => c + 1)
    }
  }, [allMessages.length, currentUserId])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distFromBottom <= el.clientHeight
    setShowScrollBtn(!nearBottom)
    isNearBottomRef.current = nearBottom
    if (nearBottom) setNewMsgCount(0)
    if (el.scrollTop < 80 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const handleSend = useCallback(async (text: string) => {
    if (!activeId) return

    // Capture before clearing state
    const capturedReplyId = replyId
    const capturedThreadId = replyMessage?.threadId ?? null

    // Optimistic: push the message into the UI immediately
    const tempId = crypto.randomUUID()
    const tempMsg: DecryptedMessage = {
      id: tempId,
      conversationId: activeId,
      senderId: currentUserId,
      content: text,
      type: 'text',
      mediaUrl: null,
      replyToId: capturedReplyId,
      threadId: capturedThreadId,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      senderProfile: currentUserProfile ?? undefined,
    }
    // Force synchronous DOM commit: message appears at opacity 0 (pre-animation state)
    flushSync(() => {
      setPendingMessages((prev) => [...prev, tempMsg])
      setPreAnimIds((prev) => new Set([...prev, tempId]))
      setReplyId(null)
    })
    // Step 2: instant scroll now that height is in the DOM
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    // Step 3: next frame — move to animating so the slide-in plays against the settled position
    requestAnimationFrame(() => {
      setPreAnimIds((prev) => { const n = new Set(prev); n.delete(tempId); return n })
      setAnimatingIds((prev) => new Set([...prev, tempId]))
      setTimeout(() => {
        setAnimatingIds((prev) => { const n = new Set(prev); n.delete(tempId); return n })
      }, 500)
    })

    // Envelope-encrypt for every member device (groups and DMs alike).
    // encrypt() falls back to mode 'phase1' (enc_v = NULL, iv = NULL) when a
    // member has no registered device yet — never a mislabeled v2.
    const memberIds = conversation?.members.map((m) => m.userId) ?? []
    const result = await encrypt(memberIds, text)
    send(
      result.mode === 'v2'
        ? { conversationId: activeId, senderId: currentUserId, content: result.content, iv: result.iv, envelopes: result.envelopes, type: 'text', replyToId: capturedReplyId, threadId: capturedThreadId }
        : { conversationId: activeId, senderId: currentUserId, content: result.content, iv: null, type: 'text', replyToId: capturedReplyId, threadId: capturedThreadId },
      {
        onSuccess: (data) => {
          pendingConfirmedRef.current.set(tempId, data.id)
          setSendError(null)
        },
        onError: (err) => {
          setPendingMessages((prev) => prev.filter((m) => m.id !== tempId))
          // Sends can now be rejected for a reason the user can act on (the
          // other person declined the request or blocked you), so the message
          // must not just silently disappear.
          const message = err instanceof Error ? err.message : ''
          setSendError(
            message.includes('cannot send in this conversation')
              ? "You can't message this person right now."
              : 'Message not sent. Please try again.',
          )
        },
      },
    )
  }, [activeId, currentUserId, currentUserProfile, encrypt, conversation, replyId, replyMessage?.threadId, send, setReplyId])

  const handleDelete = useCallback(async (messageId: string) => {
    await deleteMessage(messageId)
  }, [])

  const handleQuotationClick = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedMessageId(messageId)
      setTimeout(() => setHighlightedMessageId(null), 1500)
    }
  }, [])

  const handleOpenThread = useCallback((messageId: string) => {
    const msg = decrypted.find((m) => m.id === messageId)
    if (msg) setThreadViewRoot(msg)
  }, [decrypted])

  const handleOpenPanel = useCallback((tab: string) => {
    setPanelOpen(true)
    setPanelTab(tab)
  }, [setPanelOpen, setPanelTab])

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    const existing = reactionsMap[messageId]?.find((r) => r.emoji === emoji && r.reactedByMe)
    setReactionsMap((prev) => {
      const current = prev[messageId] ?? []
      if (existing) {
        const updated = current
          .map((r) => r.emoji === emoji ? { ...r, count: r.count - 1, reactedByMe: false } : r)
          .filter((r) => r.count > 0)
        return { ...prev, [messageId]: updated }
      }
      const found = current.find((r) => r.emoji === emoji)
      const updated = found
        ? current.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, reactedByMe: true } : r)
        : [...current, { emoji, count: 1, reactedByMe: true }]
      return { ...prev, [messageId]: updated }
    })
    if (existing) {
      await removeReaction(messageId, currentUserId, emoji)
    } else {
      await addReaction(messageId, currentUserId, emoji)
    }
  }, [reactionsMap, currentUserId])

  // Optimistically render a media message (image / gif / sticker) the same way
  // handleSend does for text: it shows immediately, then the real row replaces
  // it once send() resolves. Media is never encrypted (media_url is a public
  // URL), so there's no encrypt() step — content stays '' and iv null.
  const sendMedia = useCallback((params: { type: string; mediaUrl: string; mediaMime?: string }) => {
    if (!activeId) return
    const tempId = crypto.randomUUID()
    const tempMsg: DecryptedMessage = {
      id: tempId,
      conversationId: activeId,
      senderId: currentUserId,
      content: '',
      type: params.type,
      mediaUrl: params.mediaUrl,
      mediaMime: params.mediaMime ?? null,
      replyToId: null,
      threadId: null,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      senderProfile: currentUserProfile ?? undefined,
    }
    flushSync(() => {
      setPendingMessages((prev) => [...prev, tempMsg])
      setPreAnimIds((prev) => new Set([...prev, tempId]))
    })
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    requestAnimationFrame(() => {
      setPreAnimIds((prev) => { const n = new Set(prev); n.delete(tempId); return n })
      setAnimatingIds((prev) => new Set([...prev, tempId]))
      setTimeout(() => {
        setAnimatingIds((prev) => { const n = new Set(prev); n.delete(tempId); return n })
      }, 500)
    })
    send(
      {
        conversationId: activeId,
        senderId: currentUserId,
        content: '',
        iv: null,
        type: params.type,
        mediaUrl: params.mediaUrl,
        mediaMime: params.mediaMime,
      },
      {
        onSuccess: (data) => {
          pendingConfirmedRef.current.set(tempId, data.id)
          setSendError(null)
        },
        onError: (err) => {
          setPendingMessages((prev) => prev.filter((m) => m.id !== tempId))
          const message = err instanceof Error ? err.message : ''
          setSendError(
            message.includes('cannot send in this conversation')
              ? "You can't message this person right now."
              : 'Message not sent. Please try again.',
          )
        },
      },
    )
  }, [activeId, currentUserId, currentUserProfile, send])

  const handleImageSelect = useCallback(async (file: File) => {
    if (!activeId) return
    setMediaUploading(true)
    try {
      const { publicUrl } = await uploadMediaFile(file, currentUserId)
      sendMedia({ type: 'image', mediaUrl: publicUrl, mediaMime: file.type })
    } catch {
      setSendError('Image upload failed. Please try again.')
    }
    setMediaUploading(false)
  }, [activeId, currentUserId, sendMedia])

  const handleFileSelect = useCallback(async (file: File) => {
    if (!activeId) return
    setMediaUploading(true)
    try {
      const { publicUrl } = await uploadRawFile(file, currentUserId)
      sendMedia({ type: 'file', mediaUrl: publicUrl, mediaMime: file.type || 'application/octet-stream' })
    } catch {
      setSendError('File upload failed. Please try again.')
    }
    setMediaUploading(false)
  }, [activeId, currentUserId, sendMedia])

  const handleVoiceSend = useCallback(async (blob: Blob, mime: string) => {
    setRecordingVoice(false)
    if (!activeId) return
    setMediaUploading(true)
    try {
      const { publicUrl } = await uploadRawFile(blob, currentUserId)
      sendMedia({ type: 'voice', mediaUrl: publicUrl, mediaMime: mime })
    } catch {
      setSendError('Voice message upload failed. Please try again.')
    }
    setMediaUploading(false)
  }, [activeId, currentUserId, sendMedia])

  const handleGifSelect = useCallback((gif: GifResult) => {
    setShowExpression(false)
    sendMedia({ type: 'gif', mediaUrl: gif.url, mediaMime: 'image/gif' })
  }, [sendMedia])

  const handleStickerSelect = useCallback((url: string) => {
    setShowExpression(false)
    sendMedia({ type: 'sticker', mediaUrl: url })
  }, [sendMedia])

  if (!activeId || !conversation) {
    return (
      <Dashboard
        currentUserId={currentUserId}
        currentUserName={currentUserProfile?.display_name ?? currentUserProfile?.username ?? ''}
        conversations={conversations}
        onOpenConversation={(conversationId, tab) => {
          setActiveId(conversationId)
          if (tab) {
            setPanelOpen(true)
            setPanelTab(tab)
          }
        }}
      />
    )
  }

  const displayName = conversation.isGroup
    ? (conversation.name ?? 'Group')
    : otherMember
      ? (otherMember.profile.display_name ?? otherMember.profile.username)
      : 'Deleted user'

  const avatarSrc = conversation.isGroup ? conversation.avatarUrl : otherMember?.profile.avatar_url
  const isOnline = !conversation.isGroup && (otherMember?.profile.is_online ?? false)

  let lastDate = ''

  return (
    <div className="flex-1 flex flex-row h-full overflow-hidden">
    <div
      className="flex-1 flex flex-col h-full bg-background overflow-hidden relative"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface" style={{ paddingTop: `max(0.75rem, var(--safe-top))` }}>
        <button onClick={() => setActiveId(null)} className="md:hidden -ml-1 w-10 h-10 flex items-center justify-center rounded-full text-text-subtle active:bg-tint transition-colors">
          <ArrowLeft size={22} />
        </button>
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Expand sidebar"
            className="hidden md:flex -ml-1 w-8 h-8 items-center justify-center rounded-full border border-border text-text-subtle hover:text-primary-text hover:bg-primary-tint transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        )}
        <button
          onClick={() => setShowChatSettings(true)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <Avatar
            src={avatarSrc}
            alt={displayName}
            size={36}
            online={!conversation.isGroup ? isOnline : undefined}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold font-display text-text truncate">{displayName}</p>
            <p className="text-xs text-text-subtle">{isOnline ? 'Online' : conversation.isGroup ? `${conversation.members.length} members` : 'Offline'}</p>
          </div>
        </button>
        <div className="flex items-center gap-1">
          <button className="w-8 h-8 flex items-center justify-center rounded-full text-text-subtle hover:text-primary-text hover:bg-primary-tint transition-colors">
            <Phone size={16} />
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-full text-text-subtle hover:text-primary-text hover:bg-primary-tint transition-colors">
            <Video size={16} />
          </button>
          <button
            onClick={() => { setSearchOpen((v) => !v); setSearchQuery('') }}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${searchOpen ? 'bg-[#5b8def] text-white' : 'text-text-subtle hover:text-primary-text hover:bg-primary-tint'}`}
          >
            <Search size={16} />
          </button>
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${panelOpen ? 'bg-[#5b8def] text-white' : 'text-text-subtle hover:text-primary-text hover:bg-primary-tint'}`}
            title="Conversation details"
          >
            <PanelRight size={16} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="px-4 py-2 bg-surface border-b border-border flex items-center gap-2">
          <Search size={14} className="text-text-subtle flex-shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search messages…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 text-sm text-text placeholder:text-text-subtle outline-none bg-transparent"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-text-subtle hover:text-text">
              <X size={14} />
            </button>
          )}
          {searchQuery && (
            <span className="text-xs text-text-subtle flex-shrink-0">
              {displayMessages.length} result{displayMessages.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Pinned message banner — previews the newest currently-loaded pin */}
      <PinnedBanner
        pins={pins}
        messages={decrypted}
        onJump={handleQuotationClick}
        onUnpin={(id) => mutatePin({ messageId: id, pinned: true })}
      />

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5"
      >
        {isFetchingNextPage && (
          <div className="text-center text-xs text-text-subtle py-2">Loading older messages...</div>
        )}
        {isLoading && (
          <div className="flex items-center justify-center h-24 text-text-subtle text-sm">Loading messages...</div>
        )}

        {displayMessages.map((msg) => {
          const msgDate = new Date(msg.createdAt).toDateString()
          const showSeparator = msgDate !== lastDate
          lastDate = msgDate
          return (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              className={`transition-opacity duration-300 rounded-lg ${highlightedMessageId === msg.id ? 'bg-[#5b8def]/15' : ''} ${pendingIdSet.has(msg.id) && !preAnimIds.has(msg.id) && !animatingIds.has(msg.id) ? 'opacity-60' : ''}`}
              style={
                preAnimIds.has(msg.id) ? { opacity: 0 }
                : animatingIds.has(msg.id) ? { animation: 'msgSlideIn 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) both' }
                : undefined
              }
            >
              {showSeparator && <DateSeparator date={msg.createdAt} />}
              <MessageBubble
                message={msg}
                isOwn={msg.senderId === currentUserId}
                isRead={msg.senderId === currentUserId && msg.id === lastOwnMessageId ? readByOtherSet.has(msg.id) : undefined}
                replyMessage={msg.replyToId ? decrypted.find((m) => m.id === msg.replyToId) ?? null : null}
                threadCount={threadCounts[msg.id] ?? 0}
                conversationId={activeId ?? undefined}
                currentUserId={currentUserId}
                onReply={(id) => setReplyId(id)}
                onDelete={(id) => void handleDelete(id)}
                onQuotationClick={handleQuotationClick}
                onOpenThread={handleOpenThread}
                onReplyInThread={handleOpenThread}
                reactions={reactionsMap[msg.id] ?? []}
                onReact={handleReact}
                onOpenPanel={handleOpenPanel}
                isPinned={pinSet.has(msg.id)}
                onTogglePin={!msg.deletedAt && !pendingIdSet.has(msg.id) ? togglePin : undefined}
              />
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom FAB */}
      {showScrollBtn && (
        <button
          onClick={() => { setNewMsgCount(0); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
          className="absolute bottom-24 right-6 w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-white shadow-[0_8px_24px_rgba(91,141,239,0.4)] hover:brightness-110 transition-all z-10"
        >
          <ChevronDown size={18} />
          {newMsgCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-[10px] font-bold rounded-full px-1">
              {newMsgCount > 99 ? '99+' : newMsgCount}
            </span>
          )}
        </button>
      )}

      {/* Typing indicator — iMessage style, only visible at bottom */}
      {typingUsers.length > 0 && !showScrollBtn && (
        <div className="px-4 py-1.5 flex items-end gap-2">
          <Avatar src={typingProfile?.avatar_url} alt="" size={28} />
          <div className="bg-card rounded-2xl rounded-bl-[4px] shadow-sm shadow-black/30 border border-border px-3 py-2.5 flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-text-subtle"
                style={{ animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upload indicator */}
      {mediaUploading && (
        <div className="px-4 py-1.5 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-[#5b8def] border-t-transparent animate-spin" />
          <span className="text-xs text-text-subtle">Uploading…</span>
        </div>
      )}

      {sendError && !isMessageRequest && (
        <div className="px-4 pb-1 flex items-center justify-between gap-2">
          <p className="text-xs text-red-500">{sendError}</p>
          <button
            onClick={() => setSendError(null)}
            className="text-text-faint hover:text-text-subtle flex-shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Input — replaced by the accept/decline bar while this is still a
          message request, since the server will reject any send until then. */}
      {isMessageRequest ? (
        <MessageRequestBar
          conversationId={activeId}
          currentUserId={currentUserId}
          senderName={displayName}
          senderUserId={otherMember?.userId ?? null}
        />
      ) : recordingVoice ? (
        <VoiceRecorderBar
          onSend={(blob, mime) => void handleVoiceSend(blob, mime)}
          onCancel={() => setRecordingVoice(false)}
          onError={(msg) => setSendError(msg)}
        />
      ) : (
        <MessageInput
          onSend={(text) => { void handleSend(text); notifyStopTyping() }}
          onTyping={notifyTyping}
          onStopTyping={notifyStopTyping}
          onPickFile={() => fileInputRef.current?.click()}
          onPickCamera={() => cameraInputRef.current?.click()}
          onPickImage={() => imageInputRef.current?.click()}
          onStartVoice={() => setRecordingVoice(true)}
          onExpression={() => setShowExpression(true)}
          replyMessage={replyMessage}
          disabled={!activeId || mediaUploading || isOrphanedDM}
          placeholder={isOrphanedDM ? 'This person deleted their account' : undefined}
        />
      )}

      {/* Hidden attachment inputs driven by the composer's expanding menu */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImageSelect(f); e.target.value = '' }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImageSelect(f); e.target.value = '' }}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileSelect(f); e.target.value = '' }}
      />

      {/* Expression picker (GIFs · Stickers · Voice notes) */}
      {showExpression && (
        <ExpressionPicker
          userId={currentUserId}
          onGifSelect={handleGifSelect}
          onStickerSelect={handleStickerSelect}
          onClose={() => setShowExpression(false)}
        />
      )}

      {/* Thread panel */}
      {threadViewRoot && activeId && (
        <ThreadView
          rootMessage={threadViewRoot}
          currentUserId={currentUserId}
          conversationId={activeId}
          memberUserIds={conversation.members.map((m) => m.userId)}
          onClose={() => setThreadViewRoot(null)}
        />
      )}

      {/* Chat settings modal — group-info for groups, DM equivalent for DMs.
          Opened by tapping the header title/avatar. */}
      {showChatSettings && (
        conversation.isGroup ? (
          <GroupInfoModal
            conversation={conversation}
            currentUserId={currentUserId}
            onClose={() => setShowChatSettings(false)}
            onDeleted={() => setActiveId(null)}
          />
        ) : (
          <DmSettingsModal
            conversation={conversation}
            currentUserId={currentUserId}
            onClose={() => setShowChatSettings(false)}
            onDeleted={() => setActiveId(null)}
          />
        )
      )}

    </div>

    {/* Conversation details panel */}
    {panelOpen && activeId && (
      <ConversationPanel
        conversationId={activeId}
        currentUserId={currentUserId}
        members={conversation?.members ?? []}
        onClose={() => setPanelOpen(false)}
      />
    )}
    </div>
  )
}
