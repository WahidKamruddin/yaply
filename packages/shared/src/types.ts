// ─── Primitive aliases ────────────────────────────────────────────────────────
export type UUID = string
export type ISOTimestamp = string

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface UserProfile {
  id: UUID
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
  public_key: string | null // Base64-encoded ECDH P-256 public key
}

// ─── Conversations ────────────────────────────────────────────────────────────
export type ConversationType = 'direct' | 'group' | 'ai'

export interface Conversation {
  id: UUID
  type: ConversationType
  name: string | null
  description: string | null
  avatar_url: string | null
  created_by: UUID
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
  last_message_at: ISOTimestamp | null
  muted_until: ISOTimestamp | null
  is_archived: boolean
}

export interface ConversationMember {
  conversation_id: UUID
  user_id: UUID
  role: 'owner' | 'admin' | 'member'
  joined_at: ISOTimestamp
  last_read_at: ISOTimestamp | null
}

// ─── Messages ─────────────────────────────────────────────────────────────────
export type MessageType =
  | 'text'
  | 'image'
  | 'gif'
  | 'sticker'
  | 'file'
  | 'system'
  | 'ai'

export interface Message {
  id: UUID
  conversation_id: UUID
  sender_id: UUID
  type: MessageType
  content: string // encrypted ciphertext (base64) or plaintext for system/ai messages
  iv: string | null // base64 AES-GCM initialisation vector
  media_url: string | null
  media_mime: string | null
  reply_to_id: UUID | null
  thread_id: UUID | null
  edited_at: ISOTimestamp | null
  deleted_at: ISOTimestamp | null
  created_at: ISOTimestamp
  reactions: MessageReaction[]
}

export interface MessageReaction {
  message_id: UUID
  user_id: UUID
  emoji: string
  created_at: ISOTimestamp
}

// ─── Encryption ───────────────────────────────────────────────────────────────
export interface KeyExchange {
  conversation_id: UUID
  sender_id: UUID
  recipient_id: UUID
  encrypted_key: string // ECDH-derived AES key, encrypted with recipient's public key
  created_at: ISOTimestamp
}

// ─── Threads ──────────────────────────────────────────────────────────────────
export interface Thread {
  id: UUID
  conversation_id: UUID
  parent_message_id: UUID
  created_at: ISOTimestamp
  reply_count: number
}

// ─── Stickers ─────────────────────────────────────────────────────────────────
export interface StickerPack {
  id: UUID
  name: string
  created_by: UUID
  is_public: boolean
  created_at: ISOTimestamp
}

export interface Sticker {
  id: UUID
  pack_id: UUID
  name: string
  url: string
  created_at: ISOTimestamp
}

// ─── Reminders ────────────────────────────────────────────────────────────────
export type ReminderStatus = 'pending' | 'sent' | 'dismissed'

export interface Reminder {
  id: UUID
  user_id: UUID
  conversation_id: UUID | null
  message: string
  remind_at: ISOTimestamp
  status: ReminderStatus
  created_at: ISOTimestamp
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: UUID
  conversation_id: UUID | null
  created_by: UUID
  assigned_to: UUID | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_at: ISOTimestamp | null
  completed_at: ISOTimestamp | null
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}

// ─── Notes ────────────────────────────────────────────────────────────────────
export interface Note {
  id: UUID
  user_id: UUID
  conversation_id: UUID | null
  title: string
  content: string
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}

// ─── Albums & Media ───────────────────────────────────────────────────────────
export interface Album {
  id: UUID
  conversation_id: UUID
  name: string
  created_by: UUID
  created_at: ISOTimestamp
}

export interface AlbumMedia {
  id: UUID
  album_id: UUID
  message_id: UUID
  media_url: string
  media_mime: string
  created_at: ISOTimestamp
}

// ─── Budgets ──────────────────────────────────────────────────────────────────
export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'entertainment'
  | 'utilities'
  | 'rent'
  | 'health'
  | 'shopping'
  | 'other'

export interface Budget {
  id: UUID
  conversation_id: UUID
  name: string
  total_amount: number
  currency: string
  created_by: UUID
  created_at: ISOTimestamp
}

export interface Expense {
  id: UUID
  budget_id: UUID
  paid_by: UUID
  description: string
  amount: number
  category: ExpenseCategory
  split_between: UUID[]
  created_at: ISOTimestamp
}

// ─── AI ───────────────────────────────────────────────────────────────────────
export interface AIConversation {
  id: UUID
  user_id: UUID
  title: string | null
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}

export interface AIMessage {
  id: UUID
  ai_conversation_id: UUID
  role: 'user' | 'assistant'
  content: string // NOT encrypted — intentional trade-off
  created_at: ISOTimestamp
}

// ─── Slash command payloads ───────────────────────────────────────────────────
export interface SlashCommandMeta {
  name: string
  description: string
  usage: string
}

// ─── Friends ──────────────────────────────────────────────────────────────────
// Cross-platform contract. All state transitions are enforced server-side (see
// migration 00033); clients only render what these RPCs report.

export type FriendshipStatus = 'pending' | 'accepted'

export interface Friendship {
  id: UUID
  requester_id: UUID
  recipient_id: UUID
  status: FriendshipStatus
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}

export interface UserBlock {
  blocker_id: UUID
  blocked_id: UUID
  created_at: ISOTimestamp
}

/** Result shape of the get_relationships(uuid[]) RPC. */
export type RelationshipStatus =
  | 'none'
  | 'pending_out'
  | 'pending_in'
  | 'friends'
  | 'blocked'
  | 'blocked_by'

export interface RelationshipRow {
  user_id: UUID
  status: RelationshipStatus
  request_id: UUID | null
  mutual_friends: number
}

/** Result shape of the get_friend_suggestions(int) RPC ("People You May Know"). */
export interface FriendSuggestionRow {
  id: UUID
  username: string
  display_name: string | null
  avatar_url: string | null
  is_online: boolean
  mutual_friends: number
  shared_groups: number
}

/**
 * conversation_members.request_state — message requests.
 * 'pending' on a member row means that member may read the conversation but not
 * send in it; 'declined' locks the thread for BOTH sides. Never delete the
 * membership row to decline: trg_delete_empty_conversation would drop the whole
 * conversation.
 */
export type RequestState = 'accepted' | 'pending' | 'declined'
