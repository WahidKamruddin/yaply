// APNs payload construction for message pushes.
//
// The server cannot read message text — it only ever holds ciphertext. So the
// payload carries the sealed content plus the one envelope this specific device
// can open, and the iOS Notification Service Extension decrypts it on-device
// and rewrites the alert body. `aps.alert.body` is always a safe placeholder
// that is correct to display if the extension never runs.

// APNs hard limit is 4096 bytes. Stay under it with room for the serializer.
const APNS_MAX_BYTES = 4000

// Matches the preview strings both clients already use for media messages.
const MEDIA_BODY: Record<string, string | undefined> = {
  image: '📷 Photo',
  gif: 'GIF',
  sticker: 'Sticker',
  file: '📎 File',
  voice: '🎤 Voice message',
}

export interface MessageContext {
  message_id: string
  conversation_id: string
  conversation_type: 'direct' | 'group' | 'ai'
  conversation_name: string | null
  sender_id: string
  sender_name: string | null
  sender_username: string | null
  sender_avatar_url: string | null
  type: string
  enc_v: number | null
  iv: string | null
  content: string | null
  media_mime: string | null
  reply_to_id: string | null
  created_at: string
}

export interface Target {
  token: string
  environment: 'sandbox' | 'production'
  recipient_id: string
  device_id: number
  recipient_fp: string | null
  eph_pub: string | null
  key_iv: string | null
  wrapped_key: string | null
  unread_count: number
}

export interface BuiltPayload {
  json: string
  bytes: number
  degraded: boolean
}

// Friend requests, task assignments, confirmed events and reminders. These
// carry no encrypted content, so there is nothing for the service extension to
// do and no mutable-content flag — the text the server writes is what shows.
export interface SimpleTarget {
  token: string
  environment: 'sandbox' | 'production'
  recipient_id: string
  device_id: number
  title: string
  body: string
  conversation_id: string | null
}

export function buildSimplePayload(kind: string, target: SimpleTarget): BuiltPayload {
  const json = JSON.stringify({
    aps: {
      alert: { title: target.title, body: target.body },
      sound: 'default',
      'interruption-level': 'active',
      ...(target.conversation_id ? { 'thread-id': target.conversation_id } : {}),
    },
    v: 1,
    kind,
    ...(target.conversation_id ? { conversation_id: target.conversation_id } : {}),
    decryptable: false,
    needs_fetch: false,
  })
  return { json, bytes: byteLength(json), degraded: false }
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

export function buildPayload(ctx: MessageContext, target: Target): BuiltPayload {
  const senderName = ctx.sender_name ?? ctx.sender_username ?? 'Someone'
  const isGroup = ctx.conversation_type === 'group'

  // Media is never encrypted, so its body is final and the extension has
  // nothing to do. Text is a placeholder the extension replaces.
  const mediaBody = MEDIA_BODY[ctx.type]
  const fallbackBody = mediaBody ?? 'New message'
  const canDecrypt = mediaBody === undefined && ctx.content !== null

  const aps: Record<string, unknown> = {
    alert: {
      title: isGroup ? `${senderName} to ${ctx.conversation_name ?? "group"}` : senderName,
      body: fallbackBody,
    },
    sound: 'default',
    badge: target.unread_count,
    'thread-id': ctx.conversation_id,
    'interruption-level': 'active',
    // Required, or iOS never launches the service extension and the placeholder
    // body is what the user sees.
    ...(canDecrypt ? { 'mutable-content': 1 } : {}),
  }

  const base = {
    aps,
    v: 1,
    kind: 'message',
    message_id: ctx.message_id,
    // The device this payload is addressed to. Lets the extension pick the
    // private key for the envelope's fingerprint, including a key adopted via
    // live pairing.
    recipient_id: target.recipient_id,
    conversation_id: ctx.conversation_id,
    conversation_type: ctx.conversation_type,
    conversation_name: ctx.conversation_name,
    sender_id: ctx.sender_id,
    sender_name: senderName,
    sender_username: ctx.sender_username,
    sender_avatar_url: ctx.sender_avatar_url,
    type: ctx.type,
    media_mime: ctx.media_mime,
    reply_to_id: ctx.reply_to_id,
    created_at: ctx.created_at,
  }

  if (!canDecrypt) {
    const json = JSON.stringify({ ...base, decryptable: false, needs_fetch: false })
    return { json, bytes: byteLength(json), degraded: false }
  }

  const full = {
    ...base,
    decryptable: true,
    needs_fetch: false,
    enc_v: ctx.enc_v,
    iv: ctx.iv,
    content: ctx.content,
    // enc_v = 2 means envelope-encrypted; phase-1 (enc_v null) has no envelope
    // and `content` is plain base64 the extension can decode directly.
    envelope:
      ctx.enc_v === 2
        ? {
            recipient_fp: target.recipient_fp,
            eph_pub: target.eph_pub,
            key_iv: target.key_iv,
            wrapped_key: target.wrapped_key,
          }
        : null,
  }

  const json = JSON.stringify(full)
  const bytes = byteLength(json)
  if (bytes <= APNS_MAX_BYTES) return { json, bytes, degraded: false }

  // Too large for APNs. Never ship partial ciphertext — AES-GCM is
  // all-or-nothing and a truncated blob fails the tag check, which is
  // indistinguishable from tampering. Drop the sealed content entirely and let
  // the extension fetch it, falling back to the placeholder if it is offline.
  const degradedJson = JSON.stringify({ ...base, decryptable: false, needs_fetch: true })
  return { json: degradedJson, bytes: byteLength(degradedJson), degraded: true }
}
