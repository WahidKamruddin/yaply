import { useState } from 'react'
import { X, Smile, Mic } from 'lucide-react'
import GifPicker from './GifPicker'
import StickerPicker from './StickerPicker'
import type { GifResult } from '../api/gifs'

interface Props {
  userId: string
  onGifSelect: (gif: GifResult) => void
  onStickerSelect: (url: string) => void
  onClose: () => void
}

type Tab = 'gif' | 'sticker' | 'voice'

// The sheet opened by the emoji / expression button inside the composer text
// field. GIFs and Stickers are live (web has a sticker library, unlike iOS);
// "Voice notes" — reusable saved voice clips — is shown as coming soon so the
// surface is discoverable.
export default function ExpressionPicker({ userId, onGifSelect, onStickerSelect, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('gif')

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'gif', label: 'GIFs', icon: <span className="text-xs font-bold">GIF</span> },
    { id: 'sticker', label: 'Stickers', icon: <Smile size={13} /> },
    { id: 'voice', label: 'Voice notes', icon: <Mic size={13} /> },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-xl shadow-black/30 w-full sm:max-w-sm mx-0 sm:mx-4 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1 bg-tint rounded-lg p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === t.id ? 'bg-[#5b8def] text-white shadow-sm' : 'text-text-muted hover:text-text'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-text-subtle hover:text-text transition-colors ml-2">
            <X size={18} />
          </button>
        </div>

        {tab === 'gif' && <GifPicker onSelect={(gif) => { onGifSelect(gif); onClose() }} />}

        {tab === 'sticker' && (
          <StickerPicker userId={userId} onSelect={(url) => { onStickerSelect(url); onClose() }} />
        )}

        {tab === 'voice' && (
          <div className="flex flex-col items-center justify-center gap-2 h-64 text-center px-6">
            <Mic size={28} className="text-text-subtle" />
            <p className="text-sm font-medium text-text">Custom voice notes are coming</p>
            <p className="text-xs text-text-subtle">
              Record short reusable voice clips to send with a tap. This is still being built — for
              now, tap the microphone in the attachment menu to record a one-off voice message.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
