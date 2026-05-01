// ─── App ──────────────────────────────────────────────────────────────────────
export const APP_NAME = 'Yaply'
export const APP_VERSION = '0.1.0'

// ─── Pagination ───────────────────────────────────────────────────────────────
export const MESSAGES_PAGE_SIZE = 50
export const CONVERSATIONS_PAGE_SIZE = 30
export const SEARCH_DEBOUNCE_MS = 300

// ─── Encryption ───────────────────────────────────────────────────────────────
export const ECDH_CURVE = 'P-256' as const
export const AES_ALGORITHM = 'AES-GCM' as const
export const AES_KEY_LENGTH = 256 as const
export const AES_IV_LENGTH = 12 as const // bytes
export const AES_TAG_LENGTH = 128 as const // bits

// ─── Media ────────────────────────────────────────────────────────────────────
export const MAX_IMAGE_SIZE_MB = 10
export const MAX_FILE_SIZE_MB = 50
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
export const SUPABASE_MEDIA_BUCKET = 'media'
export const SUPABASE_STICKER_BUCKET = 'stickers'
export const SUPABASE_AVATAR_BUCKET = 'avatars'

// ─── GIF ──────────────────────────────────────────────────────────────────────
export const TENOR_API_URL = 'https://tenor.googleapis.com/v2'
export const GIF_SEARCH_LIMIT = 20

// ─── Realtime ─────────────────────────────────────────────────────────────────
export const REALTIME_HEARTBEAT_MS = 30_000

// ─── Slash commands ───────────────────────────────────────────────────────────
export const SLASH_COMMAND_PREFIX = '/'

export const SLASH_COMMANDS = [
  { name: 'help', description: 'List all available commands', usage: '/help' },
  { name: 'plan', description: 'Create a shared plan or agenda', usage: '/plan [title]' },
  { name: 'remind', description: 'Set a reminder', usage: '/remind [message] at [time]' },
  { name: 'create', description: 'Create a task, note, or budget', usage: '/create [task|note|budget]' },
  { name: 'mute', description: 'Mute this conversation', usage: '/mute [duration]' },
  { name: 'thread', description: 'Start a thread on the last message', usage: '/thread' },
] as const

// ─── AI ───────────────────────────────────────────────────────────────────────
export const AI_BOT_USERNAME = 'YaplyAI'
export const AI_CONVERSATION_TYPE = 'ai' as const

// ─── Roles ────────────────────────────────────────────────────────────────────
export const CONVERSATION_ROLES = ['owner', 'admin', 'member'] as const

// ─── Task statuses ────────────────────────────────────────────────────────────
export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const
