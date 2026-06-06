import { useState } from 'react'
import { X, Image, Smile } from 'lucide-react'
import GifPicker from './GifPicker'
import StickerPicker from './StickerPicker'
import type { GifResult } from '../api/gifs'

interface Props {
  userId: string
  onImageSelect: (file: File) => void
  onGifSelect: (gif: GifResult) => void
  onStickerSelect: (url: string) => void
  onClose: () => void
}

type Tab = 'gif' | 'image' | 'sticker'

export default function MediaPicker({ userId, onImageSelect, onGifSelect, onStickerSelect, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('gif')

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'gif', label: 'GIF', icon: <span className="text-xs font-bold">GIF</span> },
    { id: 'image', label: 'Image', icon: <Image size={13} /> },
    { id: 'sticker', label: 'Sticker', icon: <Smile size={13} /> },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#dce7f8] rounded-t-2xl sm:rounded-2xl shadow-xl shadow-[#1a2744]/10 w-full sm:max-w-sm mx-0 sm:mx-4 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1 bg-[#f3f7ff] rounded-lg p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-[#5b8def] text-white shadow-sm'
                    : 'text-[#6b84ab] hover:text-[#1a2744]'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-[#9ab0cc] hover:text-[#1a2744] transition-colors ml-2">
            <X size={18} />
          </button>
        </div>

        {tab === 'image' && (
          <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-[#dce7f8] hover:border-[#5b8def] rounded-xl cursor-pointer transition-colors bg-[#f3f7ff]">
            <Image size={28} className="text-[#9ab0cc] mb-2" />
            <span className="text-sm text-[#6b84ab]">Click to select image</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) { onImageSelect(f); onClose() }
              }}
            />
          </label>
        )}

        {tab === 'gif' && <GifPicker onSelect={(gif) => { onGifSelect(gif); onClose() }} />}

        {tab === 'sticker' && (
          <StickerPicker
            userId={userId}
            onSelect={(url) => { onStickerSelect(url); onClose() }}
          />
        )}
      </div>
    </div>
  )
}
