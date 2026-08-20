import { supabase } from '@/lib/supabase'
import { clearAllKeys, loadLocalDeviceId } from '@yaply/crypto'

export interface DeviceRow {
  id: string
  device_id: number
  device_name: string | null
  platform: string | null
  key_fingerprint: string | null
  last_active_at: string | null
  created_at: string
}

export async function fetchDevices(userId: string): Promise<DeviceRow[]> {
  const { data, error } = await supabase
    .from('devices')
    .select('id, device_id, device_name, platform, key_fingerprint, last_active_at, created_at')
    .eq('user_id', userId)
    .order('last_active_at', { ascending: false })
  if (error) throw error
  return data
}

export async function renameDevice(userId: string, deviceId: number, name: string): Promise<void> {
  const trimmed = name.trim()
  const { error } = await supabase
    .from('devices')
    .update({ device_name: trimmed || null })
    .eq('user_id', userId)
    .eq('device_id', deviceId)
  if (error) throw error
}

// Revoking is three things, not one — see migration 00035. The RPC drops the
// devices row and kills the device's auth session; this side clears the local
// keys when the revoked device is *this* one, so it can't re-register the same
// identity on the next login. A remote device does the same for itself, either
// from the realtime delete (if online) or from the orphan check in
// registerDevice (if it was offline).
export async function revokeDevice(deviceId: number): Promise<{ wasCurrentDevice: boolean }> {
  const { data: user } = await supabase.auth.getUser()
  const uid = user.user?.id
  const localDeviceId = uid ? await loadLocalDeviceId(uid) : null
  const wasCurrentDevice = localDeviceId === deviceId

  const { error } = await supabase.rpc('revoke_device', { p_device_id: deviceId })
  if (error) throw error

  if (wasCurrentDevice) {
    await clearAllKeys()
    await supabase.auth.signOut()
  }
  return { wasCurrentDevice }
}
