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

export interface DbMessage {
  id: string
  conversation_id: string
  sender_id: string | null
  encrypted_content: string
  message_type: number
  sender_device_id: number
  content_hint: string | null
  encrypted_attachment_ref: string | null
  parent_message_id: string | null
  thread_name: string | null
  deleted_at: string | null
  server_timestamp: string
  created_at: string
  sender_profile?: Profile
}

export interface DecryptedMessage {
  id: string
  conversationId: string
  senderId: string | null
  content: string
  messageType: number
  contentHint: string | null
  attachmentRef: string | null
  parentMessageId: string | null
  threadName: string | null
  deletedAt: string | null
  serverTimestamp: string
  senderProfile?: Profile
}

export interface SendMessageParams {
  conversationId: string
  senderId: string
  encryptedContent: string
  messageType?: number
  senderDeviceId?: number
  contentHint?: string | null
  encryptedAttachmentRef?: string | null
  parentMessageId?: string | null
  threadName?: string | null
}
