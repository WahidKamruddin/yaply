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
  // My own message-request state. 'pending' = a non-friend started this DM and
  // it belongs in the Message requests section: readable, not repliable, and
  // excluded from the unread count. 'declined' = hidden entirely.
  requestState: 'accepted' | 'pending' | 'declined'
  updatedAt: string
}

// Raw DB row — matches the actual messages table schema.
export interface DbMessage {
  id: string
  conversation_id: string
  sender_id: string | null
  content: string         // base64(AES-GCM ciphertext+tag) or plain base64 for phase-1
  iv: string | null       // base64(nonce[12]); null = phase-1 fallback (plain base64)
  enc_v: number | null    // 2 = envelope-encrypted (message_envelopes); null = phase-1
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
  // True when the message has an iv but no valid key could decrypt it
  // (e.g. a peer rotated identity keys). content is '' in that case and the
  // UI renders an explicit failure state.
  decryptFailed?: boolean
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
  // Present only for envelope-encrypted (enc_v = 2) sends — routes through the
  // send_message_with_envelopes RPC so message + envelopes commit atomically.
  // Absent ⇒ plain insert with enc_v = NULL (phase-1 / system / media).
  envelopes?: import('@yaply/crypto').MessageEnvelope[]
  type?: string
  replyToId?: string | null
  threadId?: string | null
  mediaUrl?: string | null
  mediaMime?: string | null
  deletedAt?: string | null
}
