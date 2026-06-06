import { supabase } from '@/lib/supabase'

const BUCKET = 'media'

async function compressImage(file: File, maxDimension = 1280, quality = 0.82): Promise<Blob> {
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
      canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

export async function uploadMediaFile(
  file: File,
  userId: string,
): Promise<{ storageRef: string; publicUrl: string }> {
  const isImage = file.type.startsWith('image/') && file.type !== 'image/gif'
  const blob = isImage ? await compressImage(file) : file
  const storageRef = `${userId}/${Date.now()}.jpg`

  const { error } = await supabase.storage.from(BUCKET).upload(storageRef, blob, {
    contentType: 'image/jpeg',
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
