import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStickers, useDeleteSticker, useCreateSticker } from '../hooks/useStickers'
import { getMediaPublicUrl } from '../api/upload'
import StickerCreator from './StickerCreator'

interface Props {
  userId: string
  onSelect: (url: string) => void
}

export default function StickerPicker({ userId, onSelect }: Props) {
  const [creating, setCreating] = useState(false)
  const { data: stickers = [] } = useStickers(userId)
  const { mutateAsync: deleteSticker } = useDeleteSticker(userId)
  const { mutateAsync: createSticker } = useCreateSticker(userId)

  if (creating) {
    return (
      <div>
        <button onClick={() => setCreating(false)} className="text-xs text-amber-400 mb-3 hover:text-amber-300">
          ← Back
        </button>
        <StickerCreator
          onCreated={async (blob, name) => {
            await createSticker({ blob, name })
            setCreating(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="h-64 overflow-y-auto">
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => setCreating(true)}
          className="aspect-square flex items-center justify-center rounded-xl border-2 border-dashed border-slate-600 hover:border-amber-500 transition-colors"
        >
          <Plus size={20} className="text-slate-400" />
        </button>
        {stickers.map((s) => {
          const url = getMediaPublicUrl(s.storage_path)
          return (
            <div key={s.id} className="relative group aspect-square">
              <button onClick={() => onSelect(url)} className="w-full h-full">
                <img src={url} alt={s.name} className="w-full h-full object-cover rounded-xl hover:opacity-80 transition-opacity" loading="lazy" />
              </button>
              <button
                onClick={() => void deleteSticker(s.id)}
                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-black/60 rounded-full text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={10} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
