import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Reply, Trash2, AlertCircle, Smile, Plus, MessageSquarePlus, MessageSquare, BookImage, Lock, Pin, PinOff, Map as MapIcon, Calendar, CheckSquare, FileText, Image as ImageIcon, DollarSign, Bell, ChevronRight } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { DecryptedMessage, MemberSummary } from '@/features/chat/types'
import type { ReactionGroup } from '@/features/chat/api/reactions'
import Avatar from '@/components/Avatar'
import { replyPreviewText } from '@/features/chat/lib/replyPreview'
import type { GroupPosition } from '@/features/chat/lib/messageGrouping'
import AddToAlbumModal from './AddToAlbumModal'
import EmojiPickerPopover from './EmojiPickerPopover'
import { getReactionRail, promoteReaction } from '@/features/chat/lib/reactionRail'
import { ITEM_META, parseSystemItem } from '@/features/chat/lib/systemItem'
import type { ItemKind, PanelTab, SystemItem } from '@/features/chat/lib/systemItem'
import { tokenizeMentions } from '@yaply/shared/mentions'
import { findUrls } from '@yaply/shared/linkPreview'
import LinkPreviewCard from './LinkPreviewCard'
import { useChatStyle } from '@/lib/chatStyle'

// Turns bare http(s) URLs and "example.com"-style bare domains inside a run of
// plain text into clickable links. Presentation-only (unlike mentions'
// grammar, this isn't a byte-for-byte cross-platform wire-format contract),
// but reuses the shared URL matcher so compose-time detection and rendering
// agree on what counts as a link.
function linkifyPlain(text: string, keyPrefix: string): Array<string | React.ReactElement> {
  const matches = findUrls(text)
  if (matches.length === 0) return [text]
  const parts: Array<string | React.ReactElement> = []
  let lastIndex = 0
  matches.forEach((match, i) => {
    if (match.start > lastIndex) parts.push(text.slice(lastIndex, match.start))
    parts.push(
      <a
        key={`${keyPrefix}-url-${i}`}
        href={match.href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {match.raw}
      </a>,
    )
    lastIndex = match.end
  })
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

// Renders decrypted text with @mention/@everyone runs styled distinctly, and
// bare URLs made clickable. Falls back to plain linkified text when there's
// nothing to highlight, so the common (non-group) case pays no extra cost.
function renderMentions(
  content: string,
  members: MemberSummary[] | undefined,
  currentUserId: string | undefined,
  isOwn: boolean,
) {
  if (!members || members.length === 0 || !content.includes('@')) return linkifyPlain(content, 'plain')
  const tokens = tokenizeMentions(
    content,
    members.map((m) => ({ userId: m.userId, username: m.profile.username })),
  )
  if (tokens.length === 1 && tokens[0].kind === 'text') return linkifyPlain(content, 'plain')

  return tokens.map((t, i) => {
    if (t.kind === 'text') return <span key={i}>{linkifyPlain(t.value, `t${i}`)}</span>
    const isSelfMention = t.everyone || t.userId === currentUserId
    const className = isSelfMention
      ? 'font-semibold rounded px-0.5 bg-primary-tint text-primary-text'
      : isOwn
        ? 'font-medium underline decoration-white/40'
        : 'font-medium text-primary'
    return (
      <span key={i} className={className}>
        {t.value}
      </span>
    )
  })
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// Small-radius "tail" corners for a bubble at a given spot in a run of
// consecutive messages (Messenger style). 'single' and 'first' are the
// original standalone-bubble tail; the tail side is right for own
// messages, left for received. Middle bubbles use a slightly softer
// radius since both inner corners are tucked. Radii come from the
// chat-style tokens in styles.css (--bubble-mid / --bubble-edge).
function tailClasses(isOwn: boolean, position: GroupPosition): string {
  switch (position) {
    case 'middle': return isOwn ? 'rounded-tr-[var(--bubble-mid)] rounded-br-[var(--bubble-mid)]' : 'rounded-tl-[var(--bubble-mid)] rounded-bl-[var(--bubble-mid)]'
    case 'last': return isOwn ? 'rounded-tr-[var(--bubble-edge)]' : 'rounded-tl-[var(--bubble-edge)]'
    default: return isOwn ? 'rounded-br-[var(--bubble-edge)]' : 'rounded-bl-[var(--bubble-edge)]'
  }
}

// Quote-bubble color — the original pill's colors (same regardless of
// isOwn), which read well in both themes: a light primary tint with a
// border, darkening slightly on hover, and muted body text.
const REPLY_QUOTE_COLORS = {
  bg: 'bg-primary-tint border border-border hover:bg-primary-tint-strong',
  text: 'text-text-muted',
  textDeleted: 'text-text-subtle',
}

// Messenger-style "X replied to Y" label above the quoted bubble.
function replyLabel(
  message: DecryptedMessage,
  replyMessage: DecryptedMessage,
  isOwn: boolean,
  currentUserId?: string,
): string {
  const subject = isOwn
    ? 'You'
    : message.senderProfile?.display_name ?? message.senderProfile?.username ?? 'Deleted user'

  let object: string
  if (currentUserId && replyMessage.senderId === currentUserId) {
    object = isOwn ? 'yourself' : 'you'
  } else if (!isOwn && replyMessage.senderId === message.senderId) {
    object = 'themselves'
  } else {
    object = replyMessage.senderProfile?.display_name ?? replyMessage.senderProfile?.username ?? 'Deleted user'
  }

  return `${subject} replied to ${object}`
}

interface Props {
  message: DecryptedMessage
  isOwn: boolean
  /** Own messages: "Sent" / "Delivered" / "Seen…", shown only when the bubble is clicked. */
  statusLabel?: string
  replyMessage?: DecryptedMessage | null
  threadCount?: number
  conversationId?: string
  currentUserId?: string
  onReply: (messageId: string) => void
  onDelete: (messageId: string) => void
  onQuotationClick?: (messageId: string) => void
  onOpenThread?: (messageId: string) => void
  onReplyInThread?: (messageId: string) => void
  reactions?: ReactionGroup[]
  onReact?: (messageId: string, emoji: string) => void
  // Legacy plain-text system messages only know which tab they belong to.
  onOpenPanel?: (tab: PanelTab) => void
  // Item-created pills open the item itself (or its tab for tasks/reminders).
  onOpenItem?: (item: SystemItem) => void
  isPinned?: boolean
  // Any conversation member can pin/unpin any message. Undefined = not a
  // pinnable context (e.g. thread view).
  onTogglePin?: (messageId: string) => void
  // Position in a run of consecutive messages from the same sender. The
  // avatar shows only beside the last bubble, the name only above the first.
  groupPosition?: GroupPosition
  // Sender names label bubbles only in group chats — in a DM the header
  // already says who the other person is.
  showSenderName?: boolean
  // Group members, for resolving @mentions in decrypted text. Undefined/empty
  // (DMs, threads that don't pass it) just renders content as plain text.
  mentionMembers?: MemberSummary[]
}

const ITEM_ICONS: Record<ItemKind, React.ElementType> = {
  task: CheckSquare,
  note: FileText,
  album: ImageIcon,
  budget: DollarSign,
  plan: MapIcon,
  event: Calendar,
  reminder: Bell,
}

// Pre-JSON system messages (plain text, expire within a week of the
// item-created pill format shipping) still get a tab link.
const SYSTEM_TAB_MAP: Array<[RegExp, PanelTab]> = [
  [/Plan created/i,     'events'],
  [/Event created/i,    'events'],
  [/Album created/i,    'albums'],
  [/Task created/i,     'tasks'],
  [/Note created/i,     'notes'],
  [/Budget created/i,   'budgets'],
  [/Reminder set/i,     'reminders'],
]

function getPanelTab(content: string): PanelTab | null {
  for (const [re, tab] of SYSTEM_TAB_MAP) {
    if (re.test(content)) return tab
  }
  return null
}

const TAB_LABELS: Record<PanelTab, string> = {
  events: 'Events',
  albums: 'Albums',
  tasks: 'Tasks',
  notes: 'Notes',
  budgets: 'Budgets',
  reminders: 'Reminders',
}

export default function MessageBubble({ message, isOwn, statusLabel, replyMessage, threadCount = 0, conversationId, currentUserId, onReply, onDelete, onQuotationClick, onOpenThread, onReplyInThread, reactions = [], onReact, onOpenPanel, onOpenItem, isPinned = false, onTogglePin, groupPosition = 'single', showSenderName = true, mentionMembers }: Props) {
  const [hovered, setHovered] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showFullEmojiPicker, setShowFullEmojiPicker] = useState(false)
  const [reactionRail, setReactionRail] = useState<string[]>(() => getReactionRail())
  const [showTime, setShowTime] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showAddToAlbum, setShowAddToAlbum] = useState(false)
  const navigate = useNavigate()
  const chatStyle = useChatStyle()
  // iMessage shows reactions as tapback badges on the bubble's corner
  // instead of a pill row underneath.
  const tapbacks = chatStyle === 'imessage' && reactions.length > 0

  // A pick from the full picker promotes that emoji into the rail's last
  // slot (device-local), then reacts with it — quick-taps on an existing
  // rail slot never reorder the rail.
  const handleCustomReaction = (emoji: string) => {
    setReactionRail(promoteReaction(emoji))
    onReact?.(message.id, emoji)
    setShowFullEmojiPicker(false)
    setShowEmojiPicker(false)
  }

  // Deleted senders have no profile row, so there's no profile to open.
  const senderUsername = !isOwn ? message.senderProfile?.username : undefined
  const openSenderProfile = senderUsername
    ? () => void navigate({ to: '/profile/$username', params: { username: senderUsername } })
    : undefined

  const isMedia = ['image', 'gif', 'sticker'].includes(message.type)
  // GIFs and stickers render standalone — no bubble background, border, or
  // padding — the way a sticker reads in Messenger/iMessage. Images keep the
  // thin frame so a photo still looks like an attachment.
  const isFrameless = message.type === 'gif' || message.type === 'sticker'
  const isSystem = message.type === 'system'
  const time = formatMessageTime(message.createdAt)
  // Frameless media (GIFs/stickers) has no solid background to hide the
  // quote bubble's bottom edge behind, so it keeps the old floating pill
  // instead of the underlap treatment.
  const replyCanUnderlap = !(isFrameless && message.mediaUrl)
  const replyColors = REPLY_QUOTE_COLORS
  const showAvatar = groupPosition === 'single' || groupPosition === 'last'
  const showName = showSenderName && (groupPosition === 'single' || groupPosition === 'first')
  // Tighter spacing inside a run; the gap after its last bubble is unchanged.
  const rowSpacing = groupPosition === 'first' || groupPosition === 'middle' ? 'mb-0' : 'mb-1'
  const avatarSpacer = <div className="w-7 flex-shrink-0" aria-hidden />

  if (isSystem) {
    // System messages with a past deletedAt are expired — render nothing.
    if (message.deletedAt && new Date(message.deletedAt) <= new Date()) return null
    const item = parseSystemItem(message.content)
    if (item) {
      const Icon = ITEM_ICONS[item.kind]
      const who = isOwn
        ? 'You'
        : (message.senderProfile?.display_name ?? message.senderProfile?.username ?? 'Someone')
      return (
        <div className="flex justify-center my-2 px-4">
          <div className="flex items-center gap-2 min-w-0 max-w-md text-xs bg-tint border border-border pl-1.5 pr-3 py-1 rounded-full">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-tint flex items-center justify-center">
              <Icon size={11} className="text-primary" />
            </span>
            <span className="min-w-0 truncate text-text-muted">
              {who} created a {ITEM_META[item.kind].noun}
              {item.title && <> · <span className="font-medium text-text">{item.title}</span></>}
            </span>
            {onOpenItem && (
              <button
                onClick={() => onOpenItem(item)}
                className="flex-shrink-0 flex items-center text-primary-text hover:text-primary font-medium transition-colors"
              >
                Open<ChevronRight size={12} />
              </button>
            )}
          </div>
        </div>
      )
    }
    const panelTab = getPanelTab(message.content)
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2 text-xs text-text-muted bg-tint px-3 py-1.5 rounded-full max-w-sm text-center">
          <span>{message.content}</span>
          {panelTab && onOpenPanel && (
            <button
              onClick={() => onOpenPanel(panelTab)}
              className="flex-shrink-0 text-primary-text hover:text-primary font-medium hover:underline underline-offset-2 transition-colors"
            >
              Open {TAB_LABELS[panelTab]} →
            </button>
          )}
        </div>
      </div>
    )
  }

  if (message.deletedAt) {
    return (
      <div className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'} ${rowSpacing}`}>
        {!isOwn && (showAvatar ? (
          <button
            onClick={openSenderProfile}
            disabled={!openSenderProfile}
            aria-label="View profile"
            className="flex-shrink-0 rounded-full disabled:cursor-default"
          >
            <Avatar src={message.senderProfile?.avatar_url} alt="" size={28} />
          </button>
        ) : avatarSpacer)}
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-tint border border-border">
          <AlertCircle size={12} className="text-text-subtle" />
          <span className="text-xs text-text-subtle italic">Message deleted</span>
        </div>
      </div>
    )
  }

  return (
    <>
    <div
      className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'} ${rowSpacing} group`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowEmojiPicker(false); setShowFullEmojiPicker(false) }}
    >
      {!isOwn && (showAvatar ? (
        <button
          onClick={openSenderProfile}
          disabled={!openSenderProfile}
          aria-label="View profile"
          className="flex-shrink-0 rounded-full disabled:cursor-default"
        >
          <Avatar src={message.senderProfile?.avatar_url} alt="" size={28} />
        </button>
      ) : avatarSpacer)}
      <div className={`flex flex-col max-w-[65%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isOwn && showName && (
          <button
            onClick={openSenderProfile}
            disabled={!openSenderProfile}
            className="text-xs text-primary-text font-medium mb-1 px-1 hover:underline disabled:no-underline disabled:cursor-default"
          >
            {message.senderProfile
              ? (message.senderProfile.display_name ?? message.senderProfile.username)
              : 'Deleted user'}
          </button>
        )}

        <div className="relative flex items-center gap-2">
          {/* Action buttons */}
          {hovered && (
            <div className={`flex items-center gap-1 ${isOwn ? 'order-first' : 'order-last'}`}>
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-tint hover:bg-tint-strong text-text-muted hover:text-text transition-colors"
                >
                  <Smile size={13} />
                </button>
                {showEmojiPicker && (
                  <div
                    className={`absolute bottom-9 ${isOwn ? 'right-0' : 'left-0'} flex items-center gap-1 bg-card rounded-full shadow-lg shadow-black/40 border border-border px-2 py-1.5 z-20`}
                  >
                    {reactionRail.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => { onReact?.(message.id, emoji); setShowEmojiPicker(false) }}
                        className="text-base leading-none hover:scale-125 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      onClick={() => setShowFullEmojiPicker((v) => !v)}
                      className="w-5 h-5 flex items-center justify-center rounded-full bg-tint hover:bg-tint-strong text-text-muted hover:text-text transition-colors"
                      title="More emoji"
                    >
                      <Plus size={11} />
                    </button>
                    {showFullEmojiPicker && (
                      <div
                        className={`absolute top-9 ${isOwn ? 'right-0' : 'left-0'} bg-card rounded-2xl shadow-lg shadow-black/40 border border-border z-20`}
                      >
                        <EmojiPickerPopover onSelect={handleCustomReaction} />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => onReply(message.id)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-tint hover:bg-tint-strong text-text-muted hover:text-text transition-colors"
                title="Reply"
              >
                <Reply size={13} />
              </button>
              <button
                onClick={() => onReplyInThread?.(message.id)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-tint hover:bg-tint-strong text-text-muted hover:text-text transition-colors"
                title="Reply in thread"
              >
                <MessageSquarePlus size={13} />
              </button>
              {onTogglePin && (
                <button
                  onClick={() => onTogglePin(message.id)}
                  className={`w-7 h-7 flex items-center justify-center rounded-full bg-tint hover:bg-tint-strong transition-colors ${isPinned ? 'text-primary-text' : 'text-text-muted hover:text-text'}`}
                  title={isPinned ? 'Unpin message' : 'Pin message'}
                >
                  {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                </button>
              )}
              {message.type === 'image' && message.mediaUrl && conversationId && currentUserId && (
                <button
                  onClick={() => setShowAddToAlbum(true)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-tint hover:bg-tint-strong text-text-muted hover:text-text transition-colors"
                  title="Add to album"
                >
                  <BookImage size={13} />
                </button>
              )}
              {isOwn && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-tint hover:bg-danger-tint text-text-muted hover:text-danger transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}

          <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} gap-0.5`}>
            {isPinned && (
              <span className="flex items-center gap-1 px-1 text-[10px] font-medium text-primary-text">
                <Pin size={9} className="rotate-45" />
                Pinned
              </span>
            )}
            {/* Reply header — who's who is said here, so the quote below
                skips the sender name. */}
            {replyMessage && (
              <span className="flex items-center gap-1 px-1 text-[10px] text-text-subtle">
                <Reply size={9} className="flex-shrink-0" />
                {replyLabel(message, replyMessage, isOwn, currentUserId)}
              </span>
            )}

            {/* Frameless media (GIF/sticker) has no solid background to hide
                behind, so its quote stays a plain pill above the bubble. No
                fixed max-width — it sizes like a normal bubble, capped only
                by the outer max-w-[65%] container. */}
            {replyMessage && !replyCanUnderlap && (
              <button
                onClick={() => onQuotationClick?.(replyMessage.id)}
                className={`mb-1 rounded-2xl px-3 py-2 text-left cursor-pointer active:scale-[0.98] transition-all ${replyColors.bg}`}
              >
                <p className={`text-xs truncate ${replyMessage.deletedAt ? `italic ${replyColors.textDeleted}` : replyColors.text}`}>
                  {replyPreviewText(replyMessage)}
                </p>
              </button>
            )}

            {/* Quote bubble + main bubble share one positioned wrapper so the
                quote can sit absolutely behind the main bubble — the
                original pill's opaque colors (never translucent — a
                translucent fill reads fine over the bubble it overlaps but
                goes invisible over the light-mode page background where it
                peeks out). It's anchored to the same tail-side edge as the
                main bubble (right for own, left for received) but sizes to
                its own content up to max-w-[220px] — it should read as long
                as its own text needs, not stretch to match the main
                bubble's width. pt-2/pb-10 give the quote's text room to
                breathe before the cutoff, and the main bubble's mt-8 sits at
                exactly half the quote's resulting height — the underlap
                Messenger uses. Absolute positioning (rather than a negative
                margin on a flex sibling) keeps this predictable regardless
                of the parent's flex gap. */}
            <div className={`relative ${tapbacks ? 'mt-2' : ''}`}>
              {replyMessage && replyCanUnderlap && (
                <button
                  onClick={() => onQuotationClick?.(replyMessage.id)}
                  className={`absolute top-0 z-0 max-w-[220px] rounded-2xl px-3 pt-2 pb-10 text-left cursor-pointer active:scale-[0.98] transition-all ${
                    isOwn ? 'right-0' : 'left-0'
                  } ${replyColors.bg}`}
                >
                  <p className={`text-xs leading-4 truncate ${replyMessage.deletedAt ? `italic ${replyColors.textDeleted}` : replyColors.text}`}>
                    {replyPreviewText(replyMessage)}
                  </p>
                </button>
              )}

              {/* Main message bubble */}
              {/* data-bubble: ChatView's send flight measures and clones this.
                  The radius transition morphs a bubble's tucked corners when
                  a new message joins its run (single → first, last → middle). */}
              <div
                data-bubble
                onClick={() => setShowTime((v) => !v)}
                className={`relative rounded-[var(--bubble-r)] cursor-pointer transition-[border-radius] duration-200 ease-out ${
                  replyMessage && replyCanUnderlap ? 'z-10 mt-8' : ''
                } ${
                  isFrameless && message.mediaUrl
                    ? ''
                    : isOwn
                      ? `bg-gradient-to-br from-primary to-primary-dark text-white ${tailClasses(true, groupPosition)}`
                      : `bg-card text-text ${tailClasses(false, groupPosition)} border border-border-soft`
                } ${
                  !(isMedia && message.mediaUrl)
                    ? 'px-3 py-2'
                    : isFrameless
                      ? ''
                      : 'p-1'
                }`}
              >
                {isMedia && message.mediaUrl ? (
                  <img
                    src={message.mediaUrl}
                    alt=""
                    className={`max-w-[260px] max-h-[340px] object-contain ${message.type === 'sticker' ? '' : 'rounded-xl'}`}
                    loading="lazy"
                  />
                ) : message.type === 'file' && message.mediaUrl ? (
                  <a
                    href={message.mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 text-sm underline underline-offset-2 ${isOwn ? 'text-white' : 'text-primary-text'}`}
                  >
                    📎 Download file
                  </a>
                ) : message.type === 'voice' && message.mediaUrl ? (
                  <audio controls src={message.mediaUrl} className="max-w-[240px]" />
                ) : message.decryptFailed ? (
                  <span
                    data-testid="message-decrypt-failed"
                    className={`flex items-center gap-1.5 text-xs italic ${isOwn ? 'text-white/70' : 'text-text-subtle'}`}
                  >
                    <Lock size={12} className="flex-shrink-0" />
                    Couldn't decrypt this message
                  </span>
                ) : (
                  <>
                    {message.content && (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {renderMentions(message.content, mentionMembers, currentUserId, isOwn)}
                      </p>
                    )}
                    {message.linkPreview && (
                      <LinkPreviewCard preview={message.linkPreview} isOwn={isOwn} hasText={!!message.content} />
                    )}
                  </>
                )}
                {/* Tapback badges (iMessage style) — overlap the bubble's
                    outer-top corner. yaply allows several reactions per
                    message, so extras stack diagonally rather than being
                    hidden. */}
                {tapbacks && (
                  <div className={`absolute -top-3 ${isOwn ? '-left-3' : '-right-3'} z-20`}>
                    {reactions.map((r, i) => (
                      <button
                        key={r.emoji}
                        onClick={(e) => { e.stopPropagation(); onReact?.(message.id, r.emoji) }}
                        title={`${r.emoji} ${r.count}`}
                        aria-label={`${r.emoji} reaction, ${r.count}`}
                        style={{ transform: `translate(${(isOwn ? 1 : -1) * i * 6}px, ${i * 6}px)`, zIndex: reactions.length - i }}
                        className={`${i === 0 ? 'relative' : 'absolute top-0 left-0'} w-6 h-6 flex items-center justify-center rounded-full bg-surface text-[13px] leading-none shadow-sm shadow-black/20 border ${
                          r.reactedByMe ? 'border-primary/60' : 'border-border'
                        }`}
                      >
                        {r.emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {showTime && (
              <div className={`flex items-center gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <span className="text-[10px] text-text-subtle">
                  {time}
                  {statusLabel && ` · ${statusLabel}`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Reaction pills */}
        {reactions.length > 0 && !tapbacks && (
          <div className="flex flex-wrap gap-1 mt-1 px-1">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact?.(message.id, r.emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
                  // Messenger's pills are borderless with a soft shadow.
                  chatStyle === 'messenger'
                    ? `border border-transparent shadow-sm shadow-black/10 ${r.reactedByMe ? 'bg-primary/15 text-primary-text' : 'bg-card text-text'}`
                    : `border ${r.reactedByMe ? 'bg-primary/15 border-primary/40 text-primary-text' : 'bg-tint border-border text-text hover:border-primary/40'}`
                }`}
              >
                <span>{r.emoji}</span>
                <span className="font-medium">{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread reply count link */}
        {threadCount > 0 && (
          <button
            onClick={() => onOpenThread?.(message.id)}
            className="flex items-center gap-1.5 mt-1 px-1 text-[11px] text-primary-text hover:text-primary hover:underline transition-colors"
          >
            <MessageSquare size={11} />
            {threadCount} {threadCount === 1 ? 'reply' : 'replies'} · Open thread
          </button>
        )}
      </div>
    </div>

    {showAddToAlbum && conversationId && currentUserId && message.mediaUrl && (
      <AddToAlbumModal
        conversationId={conversationId}
        currentUserId={currentUserId}
        messageId={message.id}
        mediaUrl={message.mediaUrl}
        mediaMime={message.mediaMime ?? 'image/jpeg'}
        onClose={() => setShowAddToAlbum(false)}
      />
    )}

    <Dialog.Root open={showDeleteModal} onOpenChange={setShowDeleteModal}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-card rounded-2xl shadow-xl shadow-black/50 border border-border p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-danger-tint flex items-center justify-center">
              <Trash2 size={20} className="text-danger" />
            </div>
            <div>
              <Dialog.Title className="text-base font-semibold text-text">
                Delete Message
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-muted">
                This will delete the message for everyone.
              </Dialog.Description>
            </div>
            <div className="flex gap-3 w-full mt-1">
              <Dialog.Close asChild>
                <button className="flex-1 px-4 py-2.5 rounded-xl border border-tint-strong text-sm font-medium text-text-muted hover:bg-tint transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={() => { onDelete(message.id); setShowDeleteModal(false) }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-medium text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    </>
  )
}
