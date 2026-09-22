import { supabase } from '@/lib/supabase'

const BUCKET = 'media'

type CompressedImage = { blob: Blob; width: number; height: number }

async function compressImage(
  file: File,
  maxDimension = 1280,
  quality = 0.82,
): Promise<CompressedImage> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(maxDimension / img.width, maxDimension / img.height, 1)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob((blob) => resolve({ blob: blob ?? file, width: w, height: h }), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ blob: file, width: 0, height: 0 }) }
    img.src = url
  })
}

// Aspect-ratio hint appended to an image's public URL as a fragment, so a
// client can reserve the bubble's final height before the image downloads
// instead of resizing the row mid-scroll. A fragment never reaches Storage and
// is ignored by any client that doesn't read it, so this needs no schema
// change. iOS parses the same key — see `MediaAspectRatio` in yaply-ios.
const AR_MIN = 0.5
const AR_MAX = 3
function withAspectRatio(publicUrl: string, width: number, height: number): string {
  if (!width || !height) return publicUrl
  const base = publicUrl.split('#')[0]
  const ratio = Math.min(Math.max(width / height, AR_MIN), AR_MAX)
  return `${base}#ar=${ratio.toFixed(4)}`
}

export async function uploadMediaFile(
  file: File,
  userId: string,
): Promise<{ storageRef: string; publicUrl: string }> {
  const isImage = file.type.startsWith('image/') && file.type !== 'image/gif'
  const compressed = isImage ? await compressImage(file) : null
  const blob = compressed?.blob ?? file
  const storageRef = `${userId}/${Date.now()}.jpg`

  const { error } = await supabase.storage.from(BUCKET).upload(storageRef, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storageRef)
  const publicUrl = compressed
    ? withAspectRatio(data.publicUrl, compressed.width, compressed.height)
    : data.publicUrl
  // storageRef stays clean — the hint is presentation metadata, not identity.
  return { storageRef, publicUrl }
}

// Upload a file verbatim — no image compression, original MIME and extension
// preserved. Used for arbitrary file attachments and voice messages (audio/*).
// Bucket is `media`; the URL is public (media is never E2E encrypted).
export async function uploadRawFile(
  file: File | Blob,
  userId: string,
): Promise<{ storageRef: string; publicUrl: string }> {
  const name = file instanceof File ? file.name : ''
  const extFromName = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  const extFromMime = file.type ? file.type.split('/')[1]?.split(';')[0] : ''
  const ext = (extFromName || extFromMime || 'bin').toLowerCase()
  const storageRef = `${userId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(storageRef, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storageRef)
  return { storageRef, publicUrl: data.publicUrl }
}

export async function uploadStickerFile(
  blob: Blob,
  userId: string,
  name: string,
): Promise<{ storageRef: string; publicUrl: string }> {
  const storageRef = `${userId}/stickers/${Date.now()}.webp`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storageRef, blob, {
    contentType: 'image/webp',
    upsert: false,
  })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storageRef)

  const { error: dbError } = await supabase.from('stickers').insert({
    user_id: userId,
    storage_path: storageRef,
    name,
  })
  if (dbError) throw dbError

  return { storageRef, publicUrl: data.publicUrl }
}

export function getMediaPublicUrl(ref: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ref)
  return data.publicUrl
}
