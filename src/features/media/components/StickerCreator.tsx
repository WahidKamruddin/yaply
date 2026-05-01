import { useRef, useState } from 'react'
import { Upload, Loader2 } from 'lucide-react'

interface Props {
  onCreated: (blob: Blob, name: string) => Promise<void>
}

export default function StickerCreator({ onCreated }: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current!
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')!
      const size = Math.min(img.width, img.height)
      const sx = (img.width - size) / 2
      const sy = (img.height - size) / 2
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256)
      setPreview(canvas.toDataURL('image/webp'))
    }
    img.src = URL.createObjectURL(file)
  }

  async function handleSave() {
    if (!canvasRef.current || !name) return
    setSaving(true)
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvasRef.current!.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas failed'))), 'image/webp'),
      )
      await onCreated(blob, name)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <canvas ref={canvasRef} className="hidden" />
      <div
        className="border-2 border-dashed border-slate-600 hover:border-amber-500 rounded-xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      >
        {preview ? (
          <img src={preview} alt="preview" className="w-24 h-24 rounded-lg object-cover" />
        ) : (
          <>
            <Upload size={24} className="text-slate-400" />
            <p className="text-sm text-slate-400 text-center">Drop image or click to upload</p>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      </div>
      <input
        type="text"
        placeholder="Sticker name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 bg-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-amber-500/50"
      />
      <button
        onClick={() => void handleSave()}
        disabled={!preview || !name || saving}
        className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black font-medium text-sm rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? 'Saving...' : 'Save Sticker'}
      </button>
    </div>
  )
}
