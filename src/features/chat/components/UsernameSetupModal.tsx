import { useState } from 'react'
import { AtSign, Check, X, Loader2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { normalizeUsername, useUsernameAvailability } from '@/features/chat/hooks/useUsernameAvailability'

interface Props {
  userId: string
  suggestedUsername: string | null
}

export default function UsernameSetupModal({ userId, suggestedUsername }: Props) {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState(suggestedUsername ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const availability = useUsernameAvailability(username)

  async function handleSave() {
    const candidate = normalizeUsername(username)

    // The debounced availability check is the pre-save guard the user sees;
    // block here too in case they hit Enter/click before it settles.
    if (availability === 'invalid') {
      setError('Username must be at least 3 characters, using only lowercase letters, numbers, underscores, dots, and hyphens.')
      return
    }
    if (availability !== 'available') {
      setError('That username is taken.')
      return
    }

    setError(null)
    setIsSaving(true)
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ username: candidate, username_set: true, updated_at: new Date().toISOString() })
        .eq('id', userId)

      if (updateError) {
        // Last-resort guard against a race where someone else claimed the
        // name between the availability check and this write — the DB's
        // unique constraint is the actual source of truth.
        setError(updateError.code === '23505' ? 'That username is taken.' : updateError.message)
        return
      }

      void queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-40" />
        <Dialog.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-card rounded-3xl shadow-2xl shadow-black/50 border border-border p-6 pt-7 outline-none overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-primary-text to-accent-mint" />

          <div className="flex flex-col items-center mb-6 text-center">
            <div className="relative mb-3">
              <div className="absolute inset-0 rounded-full bg-primary/40 blur-xl scale-110 -z-10" aria-hidden="true" />
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white ring-4 ring-tint">
                <AtSign size={26} />
              </div>
            </div>
            <Dialog.Title className="text-lg font-bold font-display text-text">Choose a username</Dialog.Title>
            <Dialog.Description className="text-sm text-text-subtle mt-1">
              People will find and mention you by this.
            </Dialog.Description>
          </div>

          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-tint mb-1.5">
            <span className="text-text-subtle font-mono text-sm">@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSave() }}
              placeholder="username"
              autoFocus
              autoComplete="username"
              className="flex-1 text-sm text-text bg-transparent outline-none placeholder:text-text-subtle"
            />
            {availability === 'checking' && <Loader2 size={14} className="text-text-subtle animate-spin" />}
            {availability === 'available' && <Check size={14} className="text-accent-mint" />}
            {availability === 'taken' && <X size={14} className="text-danger" />}
          </div>

          {availability === 'taken' && !error && <p className="text-sm text-danger mb-3">That username is taken.</p>}
          {error && <p className="text-sm text-danger mb-3">{error}</p>}

          <button
            onClick={() => void handleSave()}
            disabled={isSaving || !username.trim() || availability !== 'available'}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <>
                <Check size={15} />
                Continue
              </>
            )}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
