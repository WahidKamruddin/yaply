import { useEffect, useRef } from 'react'
import { X, MessageCircle } from 'lucide-react'

export interface InAppNotification {
  id: string
  conversationId: string
  senderName: string
  preview: string
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
      className="fixed top-4 right-4 z-50 flex items-start gap-3 bg-white rounded-2xl shadow-xl shadow-[#1a2744]/10 border border-[#dce7f8] p-3 max-w-[280px] cursor-pointer"
      style={{ animation: 'slideInRight 0.25s ease-out' }}
      onClick={() => { notification.onNavigate(); onDismiss() }}
    >
      <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-[#edf1fa]">
        <MessageCircle size={18} className="text-[#5b8def]" />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-xs font-semibold text-[#1a2744] leading-tight">{notification.senderName}</p>
        <p className="text-xs text-[#6b84ab] truncate mt-0.5">{notification.preview}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        className="flex-shrink-0 text-[#9ab0cc] hover:text-[#6b84ab] mt-0.5"
      >
        <X size={13} />
      </button>
    </div>
  )
}
