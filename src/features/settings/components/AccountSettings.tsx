import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Lock } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { differenceInYears } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/features/chat/hooks/useProfile'
import Avatar from '@/components/Avatar'

interface Props {
  userId: string
  userEmail: string
}

const USERNAME_PATTERN = /^[a-z0-9_.-]+$/

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

export default function AccountSettings({ userId, userEmail }: Props) {
  const { data: profile, refetch } = useProfile(userId)
  const queryClient = useQueryClient()

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [hasEmailAuth, setHasEmailAuth] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name ?? '')
    setUsername(profile.username ?? '')
    setBio(profile.bio ?? '')
    setBirthdate(profile.birthdate ?? '')
  }, [profile])

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const identities = data.user?.identities ?? []
      setHasEmailAuth(identities.some((i) => i.provider === 'email'))
    })
  }, [])

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSave() {
    setSaveError(null)
    setSaved(false)

    const normalizedUsername = normalizeUsername(username)
    if (normalizedUsername.length < 3) {
      setSaveError('Username must be at least 3 characters.')
      return
    }
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setSaveError('Username: only lowercase letters, numbers, underscores, dots, and hyphens.')
      return
    }

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
          avatarUrl = `${data.publicUrl}?t=${Date.now()}`
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim() || null,
          username: normalizedUsername,
          username_set: true,
          bio: bio.trim() || null,
          birthdate: birthdate || null,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (error) {
        setSaveError(error.code === '23505' ? 'That username is taken.' : error.message)
        return
      }

      await refetch()
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] })
      setAvatarPreview(null)
      setAvatarFile(null)
      setSaved(true)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSaved(false)

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    setIsChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setPasswordError(error.message)
        return
      }
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSaved(true)
    } finally {
      setIsChangingPassword(false)
    }
  }

  const shownAvatar = avatarPreview ?? profile?.avatar_url
  const name = displayName || profile?.username || 'You'
  const age = birthdate ? differenceInYears(new Date(), new Date(birthdate)) : null

  return (
    <div className="max-w-lg space-y-8">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar src={shownAvatar} alt={name} size={64} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 w-6 h-6 flex items-center justify-center rounded-full bg-primary text-white border-2 border-surface hover:bg-primary-dark hover:scale-105 transition-all"
          >
            <Camera size={12} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-text">{name}</p>
          <p className="text-xs text-text-subtle">{userEmail}</p>
        </div>
      </div>

      {/* Name + username */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="display-name" className="block text-xs font-medium text-text-subtle mb-1.5">Name</label>
          <input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full px-3 py-2.5 rounded-xl bg-tint border border-border text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/50 focus:border-[#5b8def]/50 transition"
          />
        </div>
        <div>
          <label htmlFor="username" className="block text-xs font-medium text-text-subtle mb-1.5">Username</label>
          <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-tint border border-border focus-within:ring-1 focus-within:ring-[#5b8def]/50 focus-within:border-[#5b8def]/50 transition">
            <span className="text-text-subtle text-sm">@</span>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="flex-1 min-w-0 text-sm text-text bg-transparent outline-none placeholder:text-text-subtle"
            />
          </div>
        </div>
      </div>

      {/* Personal details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="birthdate" className="block text-xs font-medium text-text-subtle mb-1.5">
            Birthdate{age !== null ? ` · ${age} years old` : ''}
          </label>
          <input
            id="birthdate"
            type="date"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full px-3 py-2.5 rounded-xl bg-tint border border-border text-sm text-text outline-none focus:ring-1 focus:ring-[#5b8def]/50 focus:border-[#5b8def]/50 transition"
          />
        </div>
        <div>
          <label htmlFor="bio" className="block text-xs font-medium text-text-subtle mb-1.5">Bio</label>
          <input
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Add a bio…"
            className="w-full px-3 py-2.5 rounded-xl bg-tint border border-border text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/50 focus:border-[#5b8def]/50 transition"
          />
        </div>
      </div>

      {saveError && <p className="text-sm text-danger">{saveError}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {isSaving ? (
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <>
              <Check size={15} />
              Save changes
            </>
          )}
        </button>
        {saved && <span className="text-sm text-accent-mint">Saved</span>}
      </div>

      {/* Password change — email-auth accounts only */}
      {hasEmailAuth && (
        <div className="pt-6 border-t border-border">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-8 h-8 flex items-center justify-center rounded-full bg-tint flex-shrink-0">
              <Lock size={14} className="text-text-subtle" />
            </span>
            <p className="text-sm font-semibold text-text">Change password</p>
          </div>
          <form onSubmit={(e) => void handleChangePassword(e)} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-password" className="block text-xs font-medium text-text-subtle mb-1.5">New password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 rounded-xl bg-tint border border-border text-sm text-text outline-none focus:ring-1 focus:ring-[#5b8def]/50 focus:border-[#5b8def]/50 transition"
              />
            </div>
            <div>
              <label htmlFor="confirm-new-password" className="block text-xs font-medium text-text-subtle mb-1.5">Confirm password</label>
              <input
                id="confirm-new-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 rounded-xl bg-tint border border-border text-sm text-text outline-none focus:ring-1 focus:ring-[#5b8def]/50 focus:border-[#5b8def]/50 transition"
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={isChangingPassword || !newPassword || !confirmPassword}
                className="px-4 py-2.5 rounded-xl bg-tint text-primary-text text-sm font-medium hover:bg-primary-tint transition-colors disabled:opacity-50"
              >
                {isChangingPassword ? 'Updating…' : 'Update password'}
              </button>
              {passwordSaved && <span className="text-sm text-accent-mint">Password updated</span>}
            </div>
            {passwordError && <p className="sm:col-span-2 text-sm text-danger">{passwordError}</p>}
          </form>
        </div>
      )}
    </div>
  )
}
