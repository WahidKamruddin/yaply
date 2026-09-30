import type { DecryptedMessage } from '@/features/chat/types'

// One-line text for a quoted message. Shared by the in-bubble quote and the
// composer's reply banner so both describe a target identically. Order
// matters: deleted wins over media, media over decryptFailed, then text.
export function replyPreviewText(replyMessage: DecryptedMessage): string {
  if (replyMessage.deletedAt) return 'Message deleted'
  if (replyMessage.type === 'image' || replyMessage.type === 'sticker') return '📷 Photo'
  if (replyMessage.type === 'gif') return 'GIF'
  if (replyMessage.type === 'voice') return '🎤 Voice message'
  if (replyMessage.type === 'file') return '📎 File'
  if (replyMessage.decryptFailed) return '🔒 Encrypted message'
  if (!replyMessage.content && replyMessage.linkPreview) {
    return `🔗 ${replyMessage.linkPreview.title ?? replyMessage.linkPreview.siteName ?? replyMessage.linkPreview.url}`
  }
  return replyMessage.content.slice(0, 80)
}

// Who the banner says you're replying to.
export function replyTargetName(replyMessage: DecryptedMessage, currentUserId?: string): string {
  if (currentUserId && replyMessage.senderId === currentUserId) return 'yourself'
  return replyMessage.senderProfile?.display_name ?? replyMessage.senderProfile?.username ?? 'Deleted user'
}
