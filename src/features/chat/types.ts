export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_online: boolean
  last_seen_at: string | null
}

export interface MemberSummary {
  userId: string
  profile: Profile
  isAdmin: boolean
  isMuted: boolean
  lastReadAt: string | null
}

export interface ConversationListItem {
  id: string
  name: string | null
  isGroup: boolean
  avatarUrl: string | null
  members: MemberSummary[]
  lastMessage: DecryptedMessage | null
  unreadCount: number
  isMuted: boolean
  mutedUntil: string | null
  updatedAt: string
}

// Raw DB row — matches the actual messages table schema.
export interface DbMessage {
  id: string
  conversation_id: string
  sender_id: string | null
  content: string         // base64(AES-GCM ciphertext+tag) or plaintext for system messages
  iv: string | null       // base64(nonce[12]); null = phase-1 fallback (plain base64)
  type: string            // 'text' | 'image' | 'gif' | 'sticker' | 'file' | 'system' | 'ai'
  media_url: string | null
  media_mime: string | null
  reply_to_id: string | null
  thread_id: string | null
  edited_at: string | null
  deleted_at: string | null
  created_at: string
  sender_profile?: Profile
}

// Post-decryption view model — the only thing the UI should render.
export interface DecryptedMessage {
  id: string
  conversationId: string
  senderId: string | null
  content: string
  type: string
  mediaUrl: string | null
  replyToId: string | null
  threadId: string | null
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  senderProfile?: Profile
}

export interface SendMessageParams {
  conversationId: string
  senderId: string
  content: string
  iv: string | null
  type?: string
  replyToId?: string | null
  threadId?: string | null
  mediaUrl?: string | null
  mediaMime?: string | null
}
