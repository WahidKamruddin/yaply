import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Phone, Video, Info, ChevronDown, ArrowLeft, Search, X, PanelRight } from 'lucide-react'
import { useAtom, useSetAtom } from 'jotai'
import { activeConversationIdAtom, replyToMessageIdAtom, conversationPanelOpenAtom, conversationPanelTabAtom } from '@/features/chat/store/chat.atoms'
import { useConversations } from '@/features/chat/hooks/useConversations'
import { useMessages } from '@/features/chat/hooks/useMessages'
import { useSendMessage } from '@/features/chat/hooks/useSendMessage'
import { useRealtimeMessages } from '@/features/chat/hooks/useRealtimeMessages'
import { useTypingIndicator } from '@/features/chat/hooks/useTypingIndicator'
import { useEncryption, getMyFingerprint, decodePhase1 } from '@/features/chat/hooks/useEncryption'
import type { DbEnvelope } from '@/features/chat/hooks/useEncryption'
import { useProfile } from '@/features/chat/hooks/useProfile'
import { markConversationRead } from '@/features/chat/api/conversations'
import { deleteMessage, fetchThreadCounts, fetchEnvelopesForMessages } from '@/features/chat/api/messages'
import { useReadReceipts } from '@/features/chat/hooks/useReadReceipts'
import GroupInfoModal from './GroupInfoModal'
import ConversationPanel from './ConversationPanel'
import { useReminderNotifications } from '@/features/chat/hooks/useReminders'
import {
  fetchReactions,
  buildReactionGroups,
  addReaction,
  removeReaction,
  type ReactionGroup,
} from '@/features/chat/api/reactions'
import { uploadMediaFile } from '@/features/media/api/upload'
import type { GifResult } from '@/features/media/api/gifs'
import { supabase } from '@/lib/supabase'
import type { DecryptedMessage, ConversationListItem } from '@/features/chat/types'
import MessageBubble from './MessageBubble'
import MessageInput from './MessageInput'
import ProfileModal from './ProfileModal'
import MediaPicker from '@/features/media/components/MediaPicker'
import ThreadView from './ThreadView'

interface Props {
  currentUserId: string
  userEmail: string
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

export default function ChatView({ currentUserId, userEmail }: Props) {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useAtom(activeConversationIdAtom)
  const [replyId, setReplyId] = useAtom(replyToMessageIdAtom)
  const [panelOpen, setPanelOpen] = useAtom(conversationPanelOpenAtom)
  const setPanelTab = useSetAtom(conversationPanelTabAtom)

  useReminderNotifications(currentUserId)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [newMsgCount, setNewMsgCount] = useState(0)
  const [decrypted, setDecrypted] = useState<DecryptedMessage[]>([])
  const [reactionsMap, setReactionsMap] = useState<Record<string, ReactionGroup[]>>({})
  const [showMedia, setShowMedia] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [pendingMessages, setPendingMessages] = useState<DecryptedMessage[]>([])
  const [preAnimIds, setPreAnimIds] = useState<Set<string>>(new Set())
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set())
  const [threadViewRoot, setThreadViewRoot] = useState<DecryptedMessage | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showGroupInfo, setShowGroupInfo] = useState(false)

  const { data: currentUserProfile } = useProfile(currentUserId)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
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

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(activeId)
  const { mutate: send } = useSendMessage(activeId ?? '')
  const { encrypt, decryptV2 } = useEncryption(currentUserId)

  useRealtimeMessages(activeId)

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
          const myFp = await getMyFingerprint(currentUserId)
          if (myFp) envelopes = await fetchEnvelopesForMessages(v2Ids, myFp)
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
        onSuccess: (data) => { pendingConfirmedRef.current.set(tempId, data.id) },
        onError: () => setPendingMessages((prev) => prev.filter((m) => m.id !== tempId)),
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

  const handleImageSelect = useCallback(async (file: File) => {
    if (!activeId) return
    setShowMedia(false)
    setMediaUploading(true)
    try {
      const { publicUrl } = await uploadMediaFile(file, currentUserId)
      send({ conversationId: activeId, senderId: currentUserId, content: '', iv: null, type: 'image', mediaUrl: publicUrl, mediaMime: file.type })
    } catch { /* silent */ }
    setMediaUploading(false)
  }, [activeId, currentUserId, send])

  const handleGifSelect = useCallback((gif: GifResult) => {
    if (!activeId) return
    setShowMedia(false)
    send({ conversationId: activeId, senderId: currentUserId, content: '', iv: null, type: 'gif', mediaUrl: gif.url })
  }, [activeId, currentUserId, send])

  const handleStickerSelect = useCallback((url: string) => {
    if (!activeId) return
    setShowMedia(false)
    send({ conversationId: activeId, senderId: currentUserId, content: '', iv: null, type: 'sticker', mediaUrl: url })
  }, [activeId, currentUserId, send])

  if (!activeId || !conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-text-subtle">
        <div className="w-16 h-16 rounded-full bg-tint border border-border flex items-center justify-center mb-4">
          <Info size={28} strokeWidth={1.5} className="text-[#5b8def]/60" />
        </div>
        <p className="text-sm font-medium text-text-muted">Select a conversation</p>
        <p className="text-xs mt-1 hidden md:block">Choose from the list on the left</p>
      </div>
    )
  }

  const displayName = conversation.isGroup
    ? (conversation.name ?? 'Group')
    : (otherMember?.profile.display_name ?? otherMember?.profile.username ?? 'Unknown')

  const avatarSrc = conversation.isGroup ? conversation.avatarUrl : otherMember?.profile.avatar_url
  const isOnline = !conversation.isGroup && (otherMember?.profile.is_online ?? false)

  let lastDate = ''

  return (
    <div className="flex-1 flex flex-row h-full overflow-hidden">
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface" style={{ paddingTop: `max(0.75rem, var(--safe-top))` }}>
        <button onClick={() => setActiveId(null)} className="md:hidden -ml-1 w-10 h-10 flex items-center justify-center rounded-full text-text-subtle active:bg-tint transition-colors">
          <ArrowLeft size={22} />
        </button>
        <div className="relative flex-shrink-0 w-9 h-9">
          {avatarSrc ? (
            <img src={avatarSrc} alt={displayName} className="w-full h-full rounded-full object-cover" />
          ) : (
            <div className="w-full h-full rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white font-semibold text-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {!conversation.isGroup && (
            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-surface ${isOnline ? 'bg-green-500' : 'bg-offline'}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold font-display text-text truncate">{displayName}</p>
          <p className="text-xs text-text-subtle">{isOnline ? 'Online' : conversation.isGroup ? `${conversation.members.length} members` : 'Offline'}</p>
        </div>
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
          {conversation.isGroup && (
            <button
              onClick={() => setShowGroupInfo(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full text-text-subtle hover:text-primary-text hover:bg-primary-tint transition-colors"
            >
              <Info size={16} />
            </button>
          )}
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${panelOpen ? 'bg-[#5b8def] text-white' : 'text-text-subtle hover:text-primary-text hover:bg-primary-tint'}`}
            title="Conversation details"
          >
            <PanelRight size={16} />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={() => setShowProfile(true)}
            className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white text-xs font-semibold overflow-hidden hover:ring-2 hover:ring-[#5b8def]/40 transition-all flex-shrink-0"
          >
            {currentUserProfile?.avatar_url ? (
              <img src={currentUserProfile.avatar_url} alt="You" className="w-full h-full object-cover" />
            ) : (
              <span>{(currentUserProfile?.display_name ?? currentUserProfile?.username ?? 'Y').charAt(0).toUpperCase()}</span>
            )}
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
          <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white text-[11px] font-semibold">
            {typingProfile?.avatar_url
              ? <img src={typingProfile.avatar_url} className="w-full h-full object-cover" alt="" />
              : (typingUsers[0]?.[0]?.toUpperCase() ?? '?')}
          </div>
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

      {/* Input */}
      <MessageInput
        onSend={(text) => { void handleSend(text); notifyStopTyping() }}
        onAttachment={() => setShowMedia(true)}
        onTyping={notifyTyping}
        onStopTyping={notifyStopTyping}
        replyMessage={replyMessage}
        disabled={!activeId || mediaUploading}
      />

      {/* Media picker */}
      {showMedia && (
        <MediaPicker
          userId={currentUserId}
          onImageSelect={(file) => void handleImageSelect(file)}
          onGifSelect={handleGifSelect}
          onStickerSelect={handleStickerSelect}
          onClose={() => setShowMedia(false)}
        />
      )}

      <ProfileModal
        userId={currentUserId}
        userEmail={userEmail}
        open={showProfile}
        onClose={() => setShowProfile(false)}
      />

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

      {/* Group info modal */}
      {showGroupInfo && conversation.isGroup && (
        <GroupInfoModal
          conversation={conversation}
          currentUserId={currentUserId}
          onClose={() => setShowGroupInfo(false)}
          onDeleted={() => setActiveId(null)}
        />
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
