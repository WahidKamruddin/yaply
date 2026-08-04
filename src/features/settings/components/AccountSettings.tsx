import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Lock, Trash2, AlertTriangle, X, Loader2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { differenceInYears } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/features/chat/hooks/useProfile'
import { normalizeUsername, useUsernameAvailability } from '@/features/chat/hooks/useUsernameAvailability'
import Avatar from '@/components/Avatar'

interface Props {
  userId: string
  userEmail: string
}

export default function AccountSettings({ userId, userEmail }: Props) {
  const { data: profile, refetch } = useProfile(userId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

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

  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const usernameAvailability = useUsernameAvailability(username, userId)

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

    // The debounced availability check (rendered next to the field) is the
    // pre-save guard; re-check here in case Save is clicked before it settles.
    if (usernameAvailability === 'invalid') {
      setSaveError('Username must be at least 3 characters, using only lowercase letters, numbers, underscores, dots, and hyphens.')
      return
    }
    if (usernameAvailability !== 'available') {
      setSaveError('That username is taken.')
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
        // Last-resort guard against a race where someone else claimed the
        // name between the availability check and this write — the DB's
        // unique constraint is the actual source of truth.
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

  async function handleDeleteAccount() {
    setDeleteError(null)
    setIsDeleting(true)
    try {
      const { error } = await supabase.functions.invoke('delete-account', { body: {} })
      if (error) throw error
      await supabase.auth.signOut()
      void navigate({ to: '/auth' })
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account')
      setIsDeleting(false)
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
            {usernameAvailability === 'checking' && <Loader2 size={14} className="text-text-subtle animate-spin flex-shrink-0" />}
            {usernameAvailability === 'available' && <Check size={14} className="text-accent-mint flex-shrink-0" />}
            {usernameAvailability === 'taken' && <X size={14} className="text-danger flex-shrink-0" />}
          </div>
          {usernameAvailability === 'taken' && <p className="text-xs text-danger mt-1">That username is taken.</p>}
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
          disabled={isSaving || usernameAvailability === 'checking' || usernameAvailability === 'taken' || usernameAvailability === 'invalid'}
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

      {/* Danger zone */}
      <div className="pt-6 border-t border-border">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-8 h-8 flex items-center justify-center rounded-full bg-danger-tint flex-shrink-0">
            <AlertTriangle size={14} className="text-danger" />
          </span>
          <p className="text-sm font-semibold text-text">Danger zone</p>
        </div>
        <div className="rounded-2xl border border-danger/30 bg-danger-tint/40 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text">Delete account</p>
            <p className="text-xs text-text-subtle mt-0.5">
              Permanently deletes your profile, messages, and conversation memberships. This cannot be undone.
            </p>
          </div>
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-danger text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      <Dialog.Root
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open)
          if (!open) {
            setDeleteConfirmText('')
            setDeleteError(null)
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-surface rounded-2xl shadow-xl shadow-black/40 border border-border p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-danger-tint flex items-center justify-center">
                <Trash2 size={20} className="text-danger" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-text">Delete your account?</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-text-subtle">
                  This permanently deletes your profile, messages, and memberships across every conversation. This cannot be undone.
                </Dialog.Description>
              </div>
              <div className="w-full text-left">
                <label htmlFor="delete-confirm" className="block text-xs font-medium text-text-subtle mb-1.5">
                  Type <span className="font-semibold text-text">DELETE</span> to confirm
                </label>
                <input
                  id="delete-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  autoComplete="off"
                  className="w-full px-3 py-2.5 rounded-xl bg-tint border border-border text-sm text-text outline-none focus:ring-1 focus:ring-danger/50 focus:border-danger/50 transition"
                />
              </div>
              {deleteError && <p className="text-sm text-danger">{deleteError}</p>}
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-text-muted hover:bg-tint transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => void handleDeleteAccount()}
                  disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-danger hover:opacity-90 text-sm font-medium text-white transition-opacity disabled:opacity-40"
                >
                  {isDeleting ? 'Deleting…' : 'Delete account'}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
