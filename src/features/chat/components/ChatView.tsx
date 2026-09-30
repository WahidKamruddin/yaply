import { useEffect, useLayoutEffect, useRef, useCallback, useState, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Phone, Video, ChevronDown, ArrowLeft, Search, X, PanelRight, ChevronRight } from 'lucide-react'
import { useAtom, useSetAtom } from 'jotai'
import { activeConversationIdAtom, replyToMessageIdAtom, conversationPanelOpenAtom, conversationPanelTargetAtom, openItemRequestAtom, sidebarCollapsedAtom } from '@/features/chat/store/chat.atoms'
import { useChatStyle } from '@/lib/chatStyle'
import { useConversations } from '@/features/chat/hooks/useConversations'
import { useMessages } from '@/features/chat/hooks/useMessages'
import { useSendMessage } from '@/features/chat/hooks/useSendMessage'
import { useRealtimeMessages } from '@/features/chat/hooks/useRealtimeMessages'
import { usePins, useTogglePin } from '@/features/chat/hooks/usePins'
import { useTypingIndicator } from '@/features/chat/hooks/useTypingIndicator'
import { useEncryption, decryptV2Cached, decodePhase1 } from '@/features/chat/hooks/useEncryption'
import { useDecryptCacheVersion } from '@/features/chat/lib/decryptCache'
import { useProfile } from '@/features/chat/hooks/useProfile'
import { markConversationRead } from '@/features/chat/api/conversations'
import { deleteMessage, fetchThreadCounts, editMessageWithEnvelopes } from '@/features/chat/api/messages'
import { useReadWatermarks } from '@/features/chat/hooks/useReadWatermarks'
import { formatStatus, messageStatus, seenHeads, withImpliedReads } from '@/features/chat/lib/readReceipts'
import SeenHeads from '@/features/chat/components/SeenHeads'
import GroupInfoModal from './GroupInfoModal'
import DmSettingsModal from './DmSettingsModal'
import ConversationPanel from './ConversationPanel'
import EventModal from './event/EventModal'
import { useEvents } from '@/features/chat/hooks/useEvents'
import { ITEM_META, opensInPanelOnly } from '@/features/chat/lib/systemItem'
import type { PanelTab, SystemItem } from '@/features/chat/lib/systemItem'
import { useReminderNotifications } from '@/features/chat/hooks/useReminders'
import { fetchReactions,
  buildReactionGroups,
  addReaction,
  removeReaction } from '@/features/chat/api/reactions'
import type { ReactionGroup } from '@/features/chat/api/reactions'
import { uploadMediaFile, uploadRawFile, withAspectRatio } from '@/features/media/api/upload'
import type { GifResult } from '@/features/media/api/gifs'
import { supabase } from '@/lib/supabase'
import type { DecryptedMessage, ConversationListItem } from '@/features/chat/types'
import { extractMentions } from '@yaply/shared/mentions'
import { encodeTextMessage, decodeTextMessage } from '@yaply/shared/linkPreview'
import type { LinkPreview } from '@yaply/shared/linkPreview'
import MessageBubble from './MessageBubble'
import { getGroupPositions } from '@/features/chat/lib/messageGrouping'
import { startSendFlight, prefersReducedMotion } from '@/features/chat/lib/sendFlight'
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
  const chatStyle = useChatStyle()
  const setPanelTarget = useSetAtom(conversationPanelTargetAtom)
  const [openItemRequest, setOpenItemRequest] = useAtom(openItemRequestAtom)
  // Plans/events open as the EventModal over the chat, not inside the panel.
  const [openEventId, setOpenEventId] = useState<string | null>(null)
  const { data: chatEvents = [], isFetched: chatEventsFetched } = useEvents(openEventId ? activeId : null)
  const openEvent = openEventId ? chatEvents.find((e) => e.id === openEventId) ?? null : null

  useEffect(() => { setOpenEventId(null) }, [activeId])

  // Consume "open this item" requests (item-created pills, Dashboard rows)
  // once their conversation is the active one. Tasks and reminders have no
  // detail view, so they open the panel tab; everything else opens the item.
  useEffect(() => {
    if (!openItemRequest || openItemRequest.conversationId !== activeId) return
    const { kind, id } = openItemRequest
    setOpenItemRequest(null)
    if (kind === 'plan' || kind === 'event') {
      setOpenEventId(id)
      return
    }
    setPanelOpen(true)
    setPanelTarget(opensInPanelOnly(kind) ? { tab: ITEM_META[kind].tab } : { tab: ITEM_META[kind].tab, itemId: id })
  }, [openItemRequest, activeId, setOpenItemRequest, setPanelOpen, setPanelTarget])

  // The event was deleted since the pill was posted — fall back to the tab.
  useEffect(() => {
    if (openEventId && chatEventsFetched && !openEvent) {
      setOpenEventId(null)
      setPanelOpen(true)
      setPanelTarget({ tab: 'events' })
    }
  }, [openEventId, chatEventsFetched, openEvent, setPanelOpen, setPanelTarget])

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
  // Text sends whose bubble is being flown in from the composer (sendFlight.ts)
  const [flyingIds, setFlyingIds] = useState<Set<string>>(new Set())
  // Messages from others that just arrived live and get a short pop-in
  const [incomingIds, setIncomingIds] = useState<Set<string>>(new Set())
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
  // realId → tempId. Rows render with key = tempId for their whole life, so
  // the pending → confirmed swap keeps the same DOM node instead of
  // remounting (which would cut a send flight short and pop the bubble).
  const renderKeyRef = useRef<Map<string, string>>(new Map())
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null)
  // Bumps when failed decrypts become retryable (pairing import) so the
  // decrypt effect re-runs; plaintexts live in the shared lib/decryptCache.
  const decryptCacheVersion = useDecryptCacheVersion()

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
  const { encrypt } = useEncryption(currentUserId)

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
  // In a DM there's only one person who could ever be typing, so use the
  // same otherMember lookup the header avatar already relies on rather than
  // matching the broadcast's userId against the member list — one less thing
  // that has to line up exactly. Groups still need the id-based lookup since
  // there's more than one possible typer.
  const typingProfile = typingUsers.length === 0
    ? null
    : !conversation?.isGroup
      ? (otherMember?.profile ?? null)
      : (conversation.members.find((m) => m.userId === typingUsers[0])?.profile ?? null)

  const allDbMessages = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.messages).reverse(),
    [data],
  )
  const replyMessage = replyId ? decrypted.find((m) => m.id === replyId) : null

  const rawWatermarks = useReadWatermarks(activeId)

  // Pending IDs for optimistic-update styling
  const pendingIdSet = useMemo(() => new Set(pendingMessages.map((m) => m.id)), [pendingMessages])


  // Clear all pending and reset initial-scroll flag when switching conversations
  useEffect(() => {
    setPendingMessages([])
    pendingConfirmedRef.current.clear()
    renderKeyRef.current.clear()
    setPreAnimIds(new Set())
    setAnimatingIds(new Set())
    setFlyingIds(new Set())
    setIncomingIds(new Set())
    initialScrollRef.current = true
    isNearBottomRef.current = true
    setNewMsgCount(0)
  }, [activeId])

  // Messages from others that arrive live get a short pop-in. Diffed against
  // the previous decrypt pass so the initial load, conversation switches and
  // older-page loads (prepended, and all older than the previous tail) never
  // animate. Layout effect so the first paint already has the start frame.
  const prevDecryptedRef = useRef<{ conversationId: string | null; ids: Set<string>; lastAt: string }>({
    conversationId: null,
    ids: new Set(),
    lastAt: '',
  })
  useLayoutEffect(() => {
    const prev = prevDecryptedRef.current
    const conversationId = decrypted[0]?.conversationId ?? null
    prevDecryptedRef.current = {
      conversationId,
      ids: new Set(decrypted.map((m) => m.id)),
      lastAt: decrypted[decrypted.length - 1]?.createdAt ?? '',
    }
    if (!conversationId || conversationId !== prev.conversationId || prev.ids.size === 0) return
    if (!isNearBottomRef.current || prefersReducedMotion()) return
    const fresh = decrypted
      .filter((m) => !prev.ids.has(m.id) && m.senderId !== currentUserId && m.createdAt > prev.lastAt)
      .map((m) => m.id)
    if (fresh.length === 0 || fresh.length > 5) return
    setIncomingIds((p) => new Set([...p, ...fresh]))
    setTimeout(() => {
      setIncomingIds((p) => { const n = new Set(p); fresh.forEach((id) => n.delete(id)); return n })
    }, 450)
  }, [decrypted, currentUserId])

  const allMessages = useMemo(() => [...decrypted, ...pendingMessages], [decrypted, pendingMessages])

  const displayMessages = useMemo(() => {
    if (!searchQuery.trim()) return allMessages
    const q = searchQuery.toLowerCase()
    return allMessages.filter((m) => m.content.toLowerCase().includes(q))
  }, [allMessages, searchQuery])

  const groupPositions = useMemo(() => getGroupPositions(displayMessages), [displayMessages])

  // Messenger-style receipts: each other member's avatar under the newest
  // message they've read, and a Sent / Delivered / Seen label on tap.
  // Sending a message means you'd read up to it.
  const watermarks = useMemo(
    () => withImpliedReads(allMessages, rawWatermarks, pendingIdSet),
    [allMessages, rawWatermarks, pendingIdSet],
  )
  const headsByMessage = useMemo(
    () => seenHeads(allMessages, watermarks, currentUserId, pendingIdSet),
    [allMessages, watermarks, currentUserId, pendingIdSet],
  )
  const memberProfile = useCallback(
    (userId: string) => conversation?.members.find((m) => m.userId === userId)?.profile,
    [conversation],
  )
  const statusLabel = useCallback(
    (msg: DecryptedMessage) =>
      formatStatus(
        messageStatus(msg, watermarks, currentUserId, pendingIdSet.has(msg.id)),
        conversation?.isGroup ?? false,
        (id) => memberProfile(id)?.display_name ?? memberProfile(id)?.username ?? 'Someone',
      ),
    [watermarks, currentUserId, pendingIdSet, conversation, memberProfile],
  )

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

      // Decrypt every enc_v = 2 message through the shared plaintext cache;
      // only cache misses go into the one batched envelope query.
      const v2Plain = await decryptV2Cached(currentUserId, allDbMessages.filter((m) => m.enc_v === 2))
      if (isAborted()) return

      for (const msg of allDbMessages) {
        let content = msg.content
        let decryptFailed = false

        if (msg.enc_v === 2) {
          // Envelope-encrypted (v2) — identical for groups and DMs. A missing
          // envelope means the message was sealed before this device existed.
          const plain = v2Plain.get(msg.id)
          if (plain == null) {
            decryptFailed = true
            content = ''
          } else {
            content = plain
          }
        } else if (!msg.iv) {
          // Phase-1 / system messages: content is plain base64.
          content = decodePhase1(msg.content)
        } else {
          // iv set but not v2: legacy pairwise ciphertext from before the
          // envelope migration — unreadable by design (history was wiped).
          console.debug('[yaply:crypto] ChatView: legacy pairwise ciphertext, rendering decryptFailed', { msgId: msg.id })
          decryptFailed = true
          content = ''
        }
        // Only type='text' ever carries a link-preview envelope; decode is a
        // no-op (returns the string unchanged) for anything else that isn't
        // our known JSON shape.
        let linkPreview: LinkPreview | undefined
        if (!decryptFailed && msg.type === 'text') {
          const decoded = decodeTextMessage(content)
          content = decoded.text
          linkPreview = decoded.linkPreview
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
          linkPreview,
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
  }, [allDbMessages, activeId, currentUserId, decryptCacheVersion])

  // Realtime reactions. Inserts are filtered to this conversation server-side
  // (message_reactions.conversation_id, migration 20260927000002); deletes
  // can't be filtered, so they're matched against the loaded messages here.
  // Either way only the one message is refetched — this used to refetch
  // reactions for every loaded message on any reaction in the database.
  useEffect(() => {
    if (!activeId) return
    const reloadOne = async (messageId: string | undefined) => {
      if (!messageId || !decryptedIdsRef.current.includes(messageId)) return
      const raw = await fetchReactions([messageId])
      const groups = buildReactionGroups(raw, currentUserId)[messageId] as ReactionGroup[] | undefined
      setReactionsMap((prev) => {
        const next = { ...prev }
        if (groups) next[messageId] = groups
        else delete next[messageId]
        return next
      })
    }
    const channel = supabase
      .channel(`reactions:${activeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `conversation_id=eq.${activeId}` },
        (payload) => void reloadOne((payload.new as { message_id?: string }).message_id),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        (payload) => void reloadOne((payload.old as { message_id?: string }).message_id),
      )
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
  //
  // Only while the tab is visible — Messenger doesn't mark a thread seen until
  // you're actually looking at it — and again the moment it becomes visible.
  // Debounced so a burst of arrivals is one watermark write.
  useEffect(() => {
    if (!activeId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const markRead = () => {
      if (document.visibilityState !== 'visible') return
      clearTimeout(timer)
      timer = setTimeout(() => {
        queryClient.setQueryData<ConversationListItem[]>(['conversations', currentUserId], (prev) =>
          prev?.map((c) => (c.id === activeId ? { ...c, unreadCount: 0, mentionUnreadCount: 0 } : c)),
        )
        markConversationRead(activeId)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ['conversations', currentUserId] })
          })
          .catch((err: unknown) => {
            console.error('[yaply] failed to mark conversation read', err)
          })
      }, 500)
    }
    markRead()
    document.addEventListener('visibilitychange', markRead)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', markRead)
    }
  }, [activeId, currentUserId, queryClient, allDbMessages.length])

  // The typing indicator fades out instead of vanishing: when it hides, keep
  // it mounted for the exit animation with the last typer's avatar (the live
  // typingProfile is already null by then). Layout effect so the unmount and
  // the exit remount land in the same frame.
  const showTyping = typingUsers.length > 0 && !showScrollBtn
  const [typingExitProfile, setTypingExitProfile] = useState<typeof typingProfile | undefined>(undefined)
  const prevTypingRef = useRef<{ show: boolean; profile: typeof typingProfile }>({ show: false, profile: null })
  useLayoutEffect(() => {
    const prev = prevTypingRef.current
    prevTypingRef.current = { show: showTyping, profile: typingProfile }
    if (showTyping) {
      setTypingExitProfile(undefined)
      return
    }
    if (!prev.show) return
    setTypingExitProfile(prev.profile)
    const t = setTimeout(() => setTypingExitProfile(undefined), 200)
    return () => clearTimeout(t)
  }, [showTyping, typingProfile])

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

  // Re-seals an already-sent message once a preview that was still in flight
  // at send time resolves. The sender's own view picks it up by invalidating
  // the messages query — the decrypt cache is keyed by `edited_at`
  // (see the decrypt effect above), so this is treated as "never seen this
  // edited_at" and re-decrypts fresh. Every other client gets it for free via
  // the existing UPDATE-invalidates-messages realtime wiring. Silent no-op on
  // failure — an attach that never lands just leaves the message as plain
  // text, matching today's behavior when a preview fails outright.
  const attachLinkPreview = useCallback(async (
    messageId: string,
    text: string,
    preview: LinkPreview,
    memberIds: string[],
  ) => {
    try {
      const result = await encrypt(memberIds, encodeTextMessage(text, preview))
      await editMessageWithEnvelopes(
        result.mode === 'v2'
          ? { messageId, content: result.content, iv: result.iv, envelopes: result.envelopes }
          : { messageId, content: result.content, iv: null },
      )
      void queryClient.invalidateQueries({ queryKey: ['messages', activeId] })
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    } catch (err) {
      console.error('[yaply] failed to attach a late-resolved link preview', err)
    }
  }, [encrypt, queryClient, activeId])

  // Next frame — move to animating so the slide-in plays against the settled
  // position. Used for media sends and whenever a send flight can't run.
  const playSlideIn = useCallback((tempId: string) => {
    requestAnimationFrame(() => {
      setPreAnimIds((prev) => { const n = new Set(prev); n.delete(tempId); return n })
      setAnimatingIds((prev) => new Set([...prev, tempId]))
      setTimeout(() => {
        setAnimatingIds((prev) => { const n = new Set(prev); n.delete(tempId); return n })
      }, 500)
    })
  }, [])

  const confirmPending = useCallback((tempId: string, realId: string) => {
    renderKeyRef.current.set(realId, tempId)
    if (decryptedIdsRef.current.includes(realId)) {
      // A realtime refetch beat onSuccess, so the real row is already
      // rendered. Drop the temp now; the stable key hands its DOM node over.
      setPendingMessages((prev) => prev.filter((m) => m.id !== tempId))
    } else {
      pendingConfirmedRef.current.set(tempId, realId)
    }
  }, [])

  const handleSend = useCallback(async (
    text: string,
    linkPreview?: LinkPreview,
    latePreview?: Promise<LinkPreview | null>,
  ) => {
    if (!activeId) return

    // Capture before clearing state
    const capturedReplyId = replyId
    const capturedThreadId = replyMessage?.threadId ?? null

    // Optimistic: push the message into the UI immediately. content stays the
    // plain display text here (never the encoded envelope) — linkPreview is
    // threaded separately so MessageBubble renders instantly, matching what
    // every decrypt site produces once the real message round-trips.
    const tempId = crypto.randomUUID()
    const tempMsg: DecryptedMessage = {
      id: tempId,
      conversationId: activeId,
      senderId: currentUserId,
      content: text,
      linkPreview,
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
    // Step 3: fly the text from the composer into its bubble. The composer
    // hasn't cleared yet (MessageInput clears after onSend returns), so its
    // text position is still measurable. A preview card would grow the bubble
    // mid-flight, so those — and reduced motion — get the plain slide-in.
    const composer = composerInputRef.current
    const flying = !linkPreview && !!composer && startSendFlight({
      source: composer,
      getTarget: () => document.getElementById(`msg-${tempId}`)?.querySelector<HTMLElement>('[data-bubble]') ?? null,
      beforeMeasure: () => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      },
      onDone: () => setFlyingIds((prev) => { const n = new Set(prev); n.delete(tempId); return n }),
    })
    if (flying) {
      setPreAnimIds((prev) => { const n = new Set(prev); n.delete(tempId); return n })
      setFlyingIds((prev) => new Set([...prev, tempId]))
    } else {
      playSlideIn(tempId)
    }

    // Envelope-encrypt for every member device (groups and DMs alike).
    // encrypt() falls back to mode 'phase1' (enc_v = NULL, iv = NULL) only when
    // a member has no registered device yet — never a mislabeled v2. Any other
    // failure throws, and the send is aborted rather than downgraded.
    // A link preview is sealed alongside the text (encodeTextMessage is a
    // no-op passthrough when there's no preview) rather than sent as a
    // plaintext side-channel like mentions, so every recipient sees the exact
    // same card with zero re-fetching. See CLAUDE.md's "Link previews".
    const memberIds = conversation?.members.map((m) => m.userId) ?? []
    let result: Awaited<ReturnType<typeof encrypt>>
    try {
      result = await encrypt(memberIds, encodeTextMessage(text, linkPreview))
    } catch {
      setPendingMessages((prev) => prev.filter((m) => m.id !== tempId))
      setSendError('Message not sent. Please try again.')
      return
    }

    // Extracted from plaintext before encryption — mention targeting is the
    // one piece of this send that travels unencrypted, since the server needs
    // it to fan out push/badge notifications. DMs never carry mentions.
    const { mentionedUserIds, mentionsEveryone } = conversation?.isGroup
      ? extractMentions(
          text,
          conversation.members.map((m) => ({ userId: m.userId, username: m.profile.username })),
          currentUserId,
        )
      : { mentionedUserIds: [], mentionsEveryone: false }

    send(
      result.mode === 'v2'
        ? { conversationId: activeId, senderId: currentUserId, content: result.content, iv: result.iv, envelopes: result.envelopes, type: 'text', replyToId: capturedReplyId, threadId: capturedThreadId, mentionedUserIds, mentionsEveryone }
        : { conversationId: activeId, senderId: currentUserId, content: result.content, iv: null, type: 'text', replyToId: capturedReplyId, threadId: capturedThreadId, mentionedUserIds, mentionsEveryone },
      {
        onSuccess: (data) => {
          confirmPending(tempId, data.id)
          setSendError(null)
          // The message already sent as plain text (never blocked on the
          // fetch) — if a preview was still resolving, attach it once it's
          // ready instead of discarding it.
          if (!linkPreview && latePreview) {
            void latePreview.then((resolved) => {
              if (resolved) void attachLinkPreview(data.id, text, resolved, memberIds)
            })
          }
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
  }, [activeId, currentUserId, currentUserProfile, encrypt, conversation, replyId, replyMessage?.threadId, send, setReplyId, attachLinkPreview, playSlideIn, confirmPending])

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

  const handleOpenPanel = useCallback((tab: PanelTab) => {
    setPanelOpen(true)
    setPanelTarget({ tab })
  }, [setPanelOpen, setPanelTarget])

  const handleOpenItem = useCallback((item: SystemItem) => {
    if (activeId) setOpenItemRequest({ conversationId: activeId, kind: item.kind, id: item.id })
  }, [activeId, setOpenItemRequest])

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    if (!activeId) return
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
      await addReaction(messageId, currentUserId, emoji, activeId)
    }
  }, [reactionsMap, currentUserId, activeId])

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
    playSlideIn(tempId)
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
          confirmPending(tempId, data.id)
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
  }, [activeId, currentUserId, currentUserProfile, send, playSlideIn, confirmPending])

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
    // Giphy reports the rendition's size, so GIFs carry the same #ar= hint as
    // uploaded images and iOS can reserve the bubble's height before loading.
    sendMedia({ type: 'gif', mediaUrl: withAspectRatio(gif.url, gif.width, gif.height), mediaMime: 'image/gif' })
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
        onOpenConversation={(conversationId, item) => {
          setActiveId(conversationId)
          if (item) setOpenItemRequest({ conversationId, ...item })
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
      <div
        className={`flex items-center gap-3 px-4 py-3 border-b ${chatStyle === 'imessage' ? 'border-border/50 bg-surface/75 backdrop-blur-xl' : 'border-border bg-surface'}`}
        style={{ paddingTop: `max(0.75rem, var(--safe-top))` }}>
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
        {/* iMessage: compact centered avatar-above-name, no status caption.
            yaply/Messenger: avatar beside name with a caption. */}
        {chatStyle === 'imessage' ? (
          <button
            onClick={() => setShowChatSettings(true)}
            className="flex flex-col items-center gap-0.5 flex-1 min-w-0"
          >
            <Avatar
              src={avatarSrc}
              alt={displayName}
              size={32}
              online={!conversation.isGroup ? isOnline : undefined}
            />
            <p className="max-w-full text-xs font-semibold text-text truncate">{displayName}</p>
          </button>
        ) : (
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
        )}
        <div className="flex items-center gap-1">
          {/* Messenger renders call buttons as solid-filled circles. */}
          <button className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${chatStyle === 'messenger' ? 'bg-primary text-white hover:bg-primary-dark' : 'text-text-subtle hover:text-primary-text hover:bg-primary-tint'}`}>
            <Phone size={16} />
          </button>
          <button className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${chatStyle === 'messenger' ? 'bg-primary text-white hover:bg-primary-dark' : 'text-text-subtle hover:text-primary-text hover:bg-primary-tint'}`}>
            <Video size={16} />
          </button>
          <button
            onClick={() => { setSearchOpen((v) => !v); setSearchQuery('') }}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${searchOpen ? 'bg-primary text-white' : 'text-text-subtle hover:text-primary-text hover:bg-primary-tint'}`}
          >
            <Search size={16} />
          </button>
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${panelOpen ? 'bg-primary text-white' : 'text-text-subtle hover:text-primary-text hover:bg-primary-tint'}`}
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

        {displayMessages.map((msg, i) => {
          const msgDate = new Date(msg.createdAt).toDateString()
          const showSeparator = msgDate !== lastDate
          lastDate = msgDate
          return (
            <div
              key={renderKeyRef.current.get(msg.id) ?? msg.id}
              id={`msg-${msg.id}`}
              className={`transition-opacity duration-300 rounded-lg ${highlightedMessageId === msg.id ? 'bg-primary/15' : ''} ${pendingIdSet.has(msg.id) && !preAnimIds.has(msg.id) && !animatingIds.has(msg.id) && !flyingIds.has(msg.id) ? 'opacity-60' : ''}`}
              style={
                preAnimIds.has(msg.id) ? { opacity: 0 }
                : animatingIds.has(msg.id) ? { animation: 'msgSlideIn 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) both' }
                : incomingIds.has(msg.id) ? { animation: 'msgIn 0.32s cubic-bezier(0.2, 0.9, 0.3, 1) both', transformOrigin: 'left bottom' }
                : undefined
              }
            >
              {showSeparator && <DateSeparator date={msg.createdAt} />}
              <MessageBubble
                message={msg}
                isOwn={msg.senderId === currentUserId}
                statusLabel={msg.senderId === currentUserId && !msg.deletedAt ? statusLabel(msg) : undefined}
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
                onOpenItem={handleOpenItem}
                isPinned={pinSet.has(msg.id)}
                onTogglePin={!msg.deletedAt && !pendingIdSet.has(msg.id) ? togglePin : undefined}
                groupPosition={groupPositions[i]}
                showSenderName={conversation.isGroup}
                mentionMembers={conversation.isGroup ? conversation.members : undefined}
              />
              <SeenHeads profiles={(headsByMessage[msg.id] ?? []).flatMap((id) => memberProfile(id) ?? [])} />
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

      {/* Typing indicator — mirrors MessageBubble's received-bubble styling exactly */}
      {(showTyping || typingExitProfile !== undefined) && (
        <div
          className={`px-4 py-1.5 flex items-end gap-2 ${showTyping ? 'animate-[typingIn_0.25s_ease-out]' : ''}`}
          style={showTyping ? undefined : { animation: 'typingOut 0.2s ease-in both' }}
        >
          <Avatar src={(showTyping ? typingProfile : typingExitProfile)?.avatar_url} alt="" size={28} />
          <div className="bg-card rounded-2xl rounded-bl-sm border border-border-soft px-3.5 py-3 flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="typing-dot w-[6px] h-[6px] rounded-full bg-text-subtle"
                style={{ animationDelay: `${i * 0.16}s` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upload indicator */}
      {mediaUploading && (
        <div className="px-4 py-1.5 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-xs text-text-subtle">Uploading…</span>
        </div>
      )}

      {sendError && !isMessageRequest && (
        <div className="px-4 pb-1 flex items-center justify-between gap-2">
          <p className="text-xs text-red-500" data-testid="send-error">
            {sendError}
          </p>
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
          inputRef={composerInputRef}
          onSend={(text, linkPreview, latePreview) => { void handleSend(text, linkPreview, latePreview); notifyStopTyping() }}
          onTyping={notifyTyping}
          onStopTyping={notifyStopTyping}
          onPickFile={() => fileInputRef.current?.click()}
          onPickCamera={() => cameraInputRef.current?.click()}
          onPickImage={() => imageInputRef.current?.click()}
          onStartVoice={() => setRecordingVoice(true)}
          onExpression={() => setShowExpression(true)}
          replyMessage={replyMessage}
          onJumpToReply={handleQuotationClick}
          disabled={!activeId || mediaUploading || isOrphanedDM}
          placeholder={isOrphanedDM ? 'This person deleted their account' : undefined}
          members={conversation.members}
          isGroup={conversation.isGroup}
          currentUserId={currentUserId}
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
          members={conversation.members}
          isGroup={conversation.isGroup}
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

    {openEvent && (
      <EventModal
        event={openEvent}
        currentUserId={currentUserId}
        conversationId={activeId}
        members={conversation.members}
        onClose={() => setOpenEventId(null)}
      />
    )}
    </div>
  )
}
