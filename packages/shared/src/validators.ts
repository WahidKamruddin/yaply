import { z } from 'zod'
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE_MB, MAX_IMAGE_SIZE_MB } from './constants.js'

// ─── User ─────────────────────────────────────────────────────────────────────
export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-z0-9_.-]+$/, 'Username may only contain lowercase letters, numbers, _, -, and .')

export const displayNameSchema = z
  .string()
  .min(1, 'Display name is required')
  .max(50, 'Display name must be at most 50 characters')

export const bioSchema = z.string().max(200, 'Bio must be at most 200 characters').optional()

export const userProfileSchema = z.object({
  username: usernameSchema,
  display_name: displayNameSchema,
  bio: bioSchema,
})

// ─── Message ──────────────────────────────────────────────────────────────────
export const messageContentSchema = z
  .string()
  .min(1, 'Message cannot be empty')
  .max(4000, 'Message must be at most 4000 characters')

export const sendMessageSchema = z.object({
  conversation_id: z.string().uuid(),
  content: messageContentSchema,
  type: z.enum(['text', 'image', 'gif', 'sticker', 'file']).default('text'),
  reply_to_id: z.string().uuid().optional(),
  thread_id: z.string().uuid().optional(),
})

// ─── Conversation ─────────────────────────────────────────────────────────────
export const createGroupSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  member_ids: z.array(z.string().uuid()).min(1, 'Add at least one other member'),
})

// ─── Task ─────────────────────────────────────────────────────────────────────
export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  due_at: z.string().datetime().optional(),
  assigned_to: z.string().uuid().optional(),
  conversation_id: z.string().uuid().optional(),
})

// ─── Reminder ─────────────────────────────────────────────────────────────────
export const createReminderSchema = z.object({
  message: z.string().min(1).max(500),
  remind_at: z.string().datetime(),
  conversation_id: z.string().uuid().optional(),
})

// ─── Note ─────────────────────────────────────────────────────────────────────
export const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10_000),
  conversation_id: z.string().uuid().optional(),
})

// ─── Budget ───────────────────────────────────────────────────────────────────
export const createBudgetSchema = z.object({
  name: z.string().min(1).max(100),
  total_amount: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  conversation_id: z.string().uuid(),
})

export const addExpenseSchema = z.object({
  budget_id: z.string().uuid(),
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
  category: z.enum([
    'food',
    'transport',
    'entertainment',
    'utilities',
    'rent',
    'health',
    'shopping',
    'other',
  ]),
  split_between: z.array(z.string().uuid()).min(1),
})

// ─── Media ────────────────────────────────────────────────────────────────────
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `File type ${file.type} is not supported`
  }
  if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    return `Image must be smaller than ${MAX_IMAGE_SIZE_MB} MB`
  }
  return null
}

export function validateGenericFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `File must be smaller than ${MAX_FILE_SIZE_MB} MB`
  }
  return null
}
