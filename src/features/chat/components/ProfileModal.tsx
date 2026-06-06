import { useState, useRef } from 'react'
import { X, LogOut, Mail, User, Pencil, Check, Camera } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProfile } from '@/features/chat/hooks/useProfile'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface Props {
  userId: string
  userEmail: string
  open: boolean
  onClose: () => void
}

function initials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function ProfileModal({ userId, userEmail, open, onClose }: Props) {
  const { data: profile, refetch } = useProfile(userId)
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const name = profile?.display_name ?? profile?.username ?? 'You'
  const username = profile?.username

  function startEditing() {
    setDisplayName(profile?.display_name ?? profile?.username ?? '')
    setBio(profile?.bio ?? '')
    setAvatarPreview(null)
    setAvatarFile(null)
    setIsEditing(true)
  }

  function cancelEditing() {
    setIsEditing(false)
    setAvatarPreview(null)
    setAvatarFile(null)
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      let avatarUrl = profile?.avatar_url ?? null

      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop() ?? 'jpg'
        const path = `${userId}/avatar.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true })
        if (!uploadError) {
          const { data } = supabase.storage.from('avatars').getPublicUrl(path)
          // Bust CDN cache with a timestamp param
          avatarUrl = `${data.publicUrl}?t=${Date.now()}`
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (!error) {
        await refetch()
        void queryClient.invalidateQueries({ queryKey: ['profile', userId] })
        setIsEditing(false)
        setAvatarPreview(null)
        setAvatarFile(null)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const shownAvatar = avatarPreview ?? profile?.avatar_url

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) { onClose(); cancelEditing() } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-2xl shadow-xl shadow-[#1a2744]/10 p-6 outline-none">
          <Dialog.Close className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-[#1a2744] hover:bg-[#edf1fa] transition-colors">
            <X size={16} />
          </Dialog.Close>

          {/* Avatar */}
          <div className="flex flex-col items-center mb-5">
            <div className="relative mb-3">
              <div className="w-20 h-20 rounded-full bg-[#5b8def] flex items-center justify-center text-white text-2xl font-semibold overflow-hidden">
                {shownAvatar ? (
                  <img src={shownAvatar} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <span>{initials(name)}</span>
                )}
              </div>
              {isEditing && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-7 h-7 flex items-center justify-center rounded-full bg-[#5b8def] text-white border-2 border-white hover:bg-[#4a7de4] transition-colors"
                  >
                    <Camera size={13} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </>
              )}
            </div>

            {isEditing ? (
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className="text-center text-lg font-bold text-[#1a2744] bg-transparent border-b-2 border-[#5b8def] outline-none w-full pb-1"
                autoFocus
              />
            ) : (
              <Dialog.Title className="text-lg font-bold text-[#1a2744]">{name}</Dialog.Title>
            )}
            {username && <p className="text-sm text-[#9ab0cc] mt-0.5">@{username}</p>}
          </div>

          {/* Info rows */}
          <div className="space-y-2 mb-5">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#f3f7ff]">
              <Mail size={14} className="text-[#9ab0cc] flex-shrink-0" />
              <span className="text-sm text-[#6b84ab] truncate">{userEmail}</span>
            </div>
            {isEditing ? (
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-[#f3f7ff]">
                <User size={14} className="text-[#9ab0cc] flex-shrink-0 mt-0.5" />
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Add a bio…"
                  rows={2}
                  className="flex-1 text-sm text-[#1a2744] bg-transparent outline-none resize-none placeholder:text-[#9ab0cc]"
                />
              </div>
            ) : profile?.bio ? (
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-[#f3f7ff]">
                <User size={14} className="text-[#9ab0cc] flex-shrink-0 mt-0.5" />
                <span className="text-sm text-[#6b84ab]">{profile.bio}</span>
              </div>
            ) : null}
          </div>

          {/* Actions */}
          {isEditing ? (
            <div className="flex gap-2">
              <button
                onClick={cancelEditing}
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-xl border border-[#dce7f8] text-[#6b84ab] text-sm font-medium hover:bg-[#f3f7ff] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#5b8def] text-white text-sm font-medium hover:bg-[#4a7de4] transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <>
                    <Check size={15} />
                    Save
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                onClick={startEditing}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#f3f7ff] text-[#5b8def] hover:bg-[#edf3ff] transition-colors text-sm font-medium"
              >
                <Pencil size={14} />
                Edit Profile
              </button>
              <button
                onClick={() => void supabase.auth.signOut()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors text-sm font-medium"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
