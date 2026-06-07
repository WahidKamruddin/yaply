import { useState } from 'react'
import { X, Image, Plus, Check } from 'lucide-react'
import { useAlbums, useAddAlbumMedia, useCreateAlbum } from '../hooks/useAlbums'

interface Props {
  conversationId: string
  currentUserId: string
  messageId: string
  mediaUrl: string
  mediaMime: string
  onClose: () => void
}

export default function AddToAlbumModal({ conversationId, currentUserId, messageId, mediaUrl, mediaMime, onClose }: Props) {
  const { data: albums = [], isLoading } = useAlbums(conversationId)
  const { mutate: addMedia, isPending: adding } = useAddAlbumMedia()
  const { mutate: createAlbum, isPending: creating } = useCreateAlbum(conversationId)
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [added, setAdded] = useState<string | null>(null)

  function handleAdd(albumId: string) {
    addMedia(
      { albumId, messageId, mediaUrl, mediaMime },
      {
        onSuccess: () => {
          setAdded(albumId)
          setTimeout(onClose, 800)
        },
      },
    )
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    createAlbum(
      { name: newName.trim(), createdBy: currentUserId },
      {
        onSuccess: () => {
          setShowCreate(false)
          setNewName('')
        },
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
      <div className="bg-white border border-[#dce7f8] rounded-2xl shadow-2xl shadow-[#dce7f8]/60 w-full max-w-xs">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#dce7f8]">
          <h2 className="text-sm font-semibold text-[#1a2744] flex items-center gap-2">
            <Image size={15} className="text-[#5b8def]" /> Add to Album
          </h2>
          <button onClick={onClose} className="text-[#9ab0cc] hover:text-[#1a2744] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-3 max-h-72 overflow-y-auto">
          {isLoading ? (
            <p className="text-xs text-[#9ab0cc] text-center py-4">Loading albums…</p>
          ) : albums.length === 0 && !showCreate ? (
            <p className="text-xs text-[#9ab0cc] text-center py-3">No albums yet.</p>
          ) : (
            <div className="space-y-1.5 mb-2">
              {albums.map((a) => (
                <button
                  key={a.id}
                  disabled={adding || added === a.id}
                  onClick={() => handleAdd(a.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-colors text-left ${
                    added === a.id
                      ? 'border-green-300 bg-green-50 text-green-700'
                      : 'border-[#dce7f8] hover:bg-[#f3f7ff] text-[#1a2744]'
                  } disabled:opacity-60`}
                >
                  <span className="text-sm">{a.name}</span>
                  {added === a.id && <Check size={14} className="text-green-500" />}
                </button>
              ))}
            </div>
          )}

          {showCreate ? (
            <form onSubmit={handleCreate} className="flex gap-2">
              <input
                autoFocus
                type="text"
                placeholder="Album name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm bg-[#f3f7ff] rounded-lg text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
              />
              <button type="submit" disabled={creating || !newName.trim()} className="px-3 py-1.5 text-xs font-medium bg-[#5b8def] text-white rounded-lg disabled:opacity-50">
                {creating ? '…' : 'Create'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="text-[#9ab0cc] hover:text-[#6b84ab]">
                <X size={15} />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 text-xs text-[#5b8def] hover:text-[#4a7de4] transition-colors mt-1"
            >
              <Plus size={13} /> New album
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
