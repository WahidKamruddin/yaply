import Avatar from '@/components/Avatar'
import type { Profile } from '../types'

const MAX_SHOWN = 4

/**
 * Messenger's "seen" avatars: the people whose read watermark lands on this
 * message, right-aligned under it. They move down the thread as those people
 * read further (placement is `seenHeads` in lib/readReceipts).
 */
export default function SeenHeads({ profiles }: { profiles: Profile[] }) {
  if (profiles.length === 0) return null
  const shown = profiles.slice(0, MAX_SHOWN)
  const extra = profiles.length - shown.length
  const label = `Seen by ${profiles.map((p) => p.display_name ?? p.username).join(', ')}`
  return (
    <div className="flex justify-end items-center pr-1 pt-0.5 motion-safe:animate-in motion-safe:fade-in" aria-label={label} title={label}>
      <div className="flex -space-x-1">
        {shown.map((p) => (
          <Avatar key={p.id} src={p.avatar_url} alt={p.display_name ?? p.username} size={14} className="ring-1 ring-bg" />
        ))}
      </div>
      {extra > 0 && <span className="ml-1 text-[10px] text-text-subtle">+{extra}</span>}
    </div>
  )
}
