import { useState, useRef } from 'react'
import { X, LogOut, Mail, User, Pencil, Check, Camera, Sun, Moon } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProfile } from '@/features/chat/hooks/useProfile'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/useTheme'

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
  const { light, toggleTheme } = useTheme()
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
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-card rounded-3xl shadow-2xl shadow-black/50 border border-border p-6 pt-7 outline-none overflow-hidden">
          {/* Brand accent bar */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-primary-text to-accent-mint" />

          <Dialog.Close className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-tint transition-colors">
            <X size={16} />
          </Dialog.Close>

          {/* Avatar */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative mb-3">
              <div className="absolute inset-0 rounded-full bg-primary/40 blur-xl scale-110 -z-10" aria-hidden="true" />
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white text-2xl font-semibold overflow-hidden ring-4 ring-tint">
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
                    className="absolute bottom-0 right-0 w-7 h-7 flex items-center justify-center rounded-full bg-primary text-white border-2 border-card hover:bg-primary-dark hover:scale-105 transition-all"
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
                className="text-center text-lg font-bold text-text bg-transparent border-b-2 border-primary outline-none w-full pb-1"
                autoFocus
              />
            ) : (
              <Dialog.Title className="text-lg font-bold font-display text-text">{name}</Dialog.Title>
            )}
            {username && <p className="text-sm text-text-subtle mt-0.5">@{username}</p>}
          </div>

          {/* Contact */}
          <div className="mb-5">
            <p className="font-mono text-[10px] font-semibold text-text-subtle uppercase tracking-widest px-1 mb-1.5">Contact</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-tint">
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-primary-tint flex-shrink-0">
                  <Mail size={12} className="text-primary-text" />
                </span>
                <span className="text-sm text-text-muted truncate">{userEmail}</span>
              </div>
              {isEditing ? (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-tint">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-primary-tint flex-shrink-0 mt-0.5">
                    <User size={12} className="text-primary-text" />
                  </span>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Add a bio…"
                    rows={2}
                    className="flex-1 text-sm text-text bg-transparent outline-none resize-none placeholder:text-text-subtle"
                  />
                </div>
              ) : profile?.bio ? (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-tint">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-primary-tint flex-shrink-0 mt-0.5">
                    <User size={12} className="text-primary-text" />
                  </span>
                  <span className="text-sm text-text-muted">{profile.bio}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Appearance */}
          <div className="mb-5">
            <p className="font-mono text-[10px] font-semibold text-text-subtle uppercase tracking-widest px-1 mb-1.5">Appearance</p>
            <div className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl bg-tint">
              <span className="flex items-center gap-2.5">
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-primary-tint flex-shrink-0">
                  {light ? <Sun size={12} className="text-primary-text" /> : <Moon size={12} className="text-primary-text" />}
                </span>
                <span className="text-sm text-text-muted">{light ? 'Light mode' : 'Dark mode'}</span>
              </span>
              <button
                role="switch"
                aria-checked={!light}
                aria-label="Toggle dark mode"
                onClick={toggleTheme}
                className={`relative w-10 h-[22px] rounded-full flex-shrink-0 transition-colors duration-300 ${!light ? 'bg-primary' : 'bg-tint-strong'}`}
              >
                <span
                  className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ease-out ${!light ? 'translate-x-[18px]' : 'translate-x-0'}`}
                />
              </button>
            </div>
          </div>

          {/* Actions */}
          {isEditing ? (
            <div className="flex gap-2">
              <button
                onClick={cancelEditing}
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-xl border border-border text-text-muted text-sm font-medium hover:bg-tint transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
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
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-tint text-primary-text hover:bg-primary-tint transition-colors text-sm font-medium"
              >
                <Pencil size={14} />
                Edit Profile
              </button>
              <button
                onClick={() => void supabase.auth.signOut()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-danger-tint text-danger hover:brightness-95 transition-colors text-sm font-medium"
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
