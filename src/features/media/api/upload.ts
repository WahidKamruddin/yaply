import { supabase } from '@/lib/supabase'

const BUCKET = 'media'

export async function uploadMediaFile(
  file: File,
  userId: string,
): Promise<{ storageRef: string; publicUrl: string }> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const storageRef = `${userId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(storageRef, file, { upsert: false })
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
