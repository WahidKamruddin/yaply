import { useEffect, useRef } from 'react'
import { X, MessageCircle, UserPlus } from 'lucide-react'

export interface InAppNotification {
  id: string
  conversationId: string
  senderName: string
  preview: string
  /** Chooses the icon only — the banner layout is identical either way. */
  kind?: 'message' | 'friend'
  onNavigate: () => void
}

interface Props {
  notification: InAppNotification | null
  onDismiss: () => void
}

export default function NotificationBanner({ notification, onDismiss }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!notification) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(onDismiss, 4000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [notification?.id, onDismiss])

  if (!notification) return null

  return (
    <div
      className="fixed top-4 right-4 z-50 flex items-start gap-3 bg-card rounded-2xl shadow-xl shadow-black/30 border border-border p-3 max-w-[280px] cursor-pointer"
      style={{ animation: 'slideInRight 0.25s ease-out' }}
      onClick={() => { notification.onNavigate(); onDismiss() }}
    >
      <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-tint">
        {notification.kind === 'friend' ? (
          <UserPlus size={18} className="text-[#5b8def]" />
        ) : (
          <MessageCircle size={18} className="text-[#5b8def]" />
        )}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-xs font-semibold text-text leading-tight">{notification.senderName}</p>
        <p className="text-xs text-text-muted truncate mt-0.5">{notification.preview}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        className="flex-shrink-0 text-text-subtle hover:text-text-muted mt-0.5"
      >
        <X size={13} />
      </button>
    </div>
  )
}
