import { useState, useRef } from 'react'
import { Image, ArrowLeft, Trash2, Plus, X, Upload, Check, Link2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Album } from '../../hooks/useAlbums'
import { useAlbums, useAlbumMedia, useAddAlbumMedia, useCreateAlbum, useDeleteAlbum, useConversationImages } from '../../hooks/useAlbums'
import { useEvents, useLinkToEvent } from '../../hooks/useEvents'
import { uploadMediaFile } from '@/features/media/api/upload'

interface Props {
  conversationId: string
  currentUserId: string
}

type PhotoTab = 'chat' | 'device'

function AlbumGallery({ album, conversationId, currentUserId, onBack }: { album: Album; conversationId: string; currentUserId: string; onBack: () => void }) {
  const { data: media = [], isLoading } = useAlbumMedia(album.id)
  const { mutate: addMedia, isPending: adding } = useAddAlbumMedia()
  const { data: chatImages = [] } = useConversationImages(conversationId)
  const { data: events = [] } = useEvents(conversationId)
  const { mutate: linkToEvent, isPending: linking } = useLinkToEvent()
  const { mutate: deleteAlbum } = useDeleteAlbum()

  const [showAddPhotos, setShowAddPhotos] = useState(false)
  const [photoTab, setPhotoTab] = useState<PhotoTab>('chat')
  const [selectedChatImages, setSelectedChatImages] = useState<Set<string>>(new Set())
  const [deviceFiles, setDeviceFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canDelete = album.created_by === currentUserId
  const existingUrls = new Set(media.map((m) => m.media_url))
  const availableChatImages = chatImages.filter((img) => !existingUrls.has(img.media_url))

  function toggleChatImage(id: string) {
    setSelectedChatImages((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleDeviceFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setDeviceFiles((prev) => [...prev, ...files])
    e.target.value = ''
  }

  async function handleAddPhotos() {
    setUploading(true)
    try {
      const chatToAdd = chatImages.filter((img) => selectedChatImages.has(img.id))
      for (const img of chatToAdd) {
        await new Promise<void>((resolve, reject) =>
          addMedia({ albumId: album.id, messageId: img.id, mediaUrl: img.media_url, mediaMime: img.media_mime }, { onSuccess: () => resolve(), onError: reject })
        )
      }
      for (const file of deviceFiles) {
        const { publicUrl } = await uploadMediaFile(file, currentUserId)
        await new Promise<void>((resolve, reject) =>
          addMedia({ albumId: album.id, messageId: null, mediaUrl: publicUrl, mediaMime: 'image/jpeg' }, { onSuccess: () => resolve(), onError: reject })
        )
      }
      setSelectedChatImages(new Set())
      setDeviceFiles([])
      setShowAddPhotos(false)
    } finally {
      setUploading(false)
    }
  }

  const selectedCount = selectedChatImages.size + deviceFiles.length

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-[#5b8def] mb-3 hover:text-[#4a7de4] transition-colors">
        <ArrowLeft size={12} /> Back to albums
      </button>

      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#1a2744]">{album.name}</h3>
          <p className="text-[10px] text-[#b0c0d8]">by {album.creator?.display_name ?? album.creator?.username ?? 'Unknown'}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => canDelete && setPendingDelete(true)}
            disabled={!canDelete}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${canDelete ? 'text-[#c5d5e8] hover:text-red-400' : 'text-[#dce7f8] opacity-40 cursor-not-allowed'}`}
            title="Delete album"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setShowAddPhotos((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${showAddPhotos ? 'bg-[#5b8def] text-white' : 'bg-[#edf1fa] text-[#5b8def] hover:bg-[#dce7f8]'}`}
          >
            <Plus size={12} /> Add photos
          </button>
        </div>
      </div>

      {/* Event link editor */}
      {events.length > 0 && (
        <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 bg-[#f3f7ff] rounded-lg">
          <Link2 size={11} className="text-[#9ab0cc] flex-shrink-0" />
          <select
            value={album.event_id ?? ''}
            onChange={(e) => linkToEvent({ table: 'albums', itemId: album.id, eventId: e.target.value || null })}
            disabled={linking}
            className="flex-1 text-xs text-[#6b84ab] bg-transparent outline-none cursor-pointer"
          >
            <option value="">No linked event</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Add photos panel */}
      {showAddPhotos && (
        <div className="mb-4 border border-[#dce7f8] rounded-xl overflow-hidden">
          <div className="flex border-b border-[#dce7f8]">
            {(['chat', 'device'] as PhotoTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setPhotoTab(t)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${photoTab === t ? 'bg-white text-[#5b8def] border-b-2 border-[#5b8def]' : 'bg-[#f3f7ff] text-[#9ab0cc] hover:text-[#6b84ab]'}`}
              >
                {t === 'chat' ? 'From chat' : 'From device'}
                {t === 'chat' && selectedChatImages.size > 0 && (
                  <span className="ml-1 px-1 py-0.5 bg-[#5b8def] text-white rounded-full text-[10px]">{selectedChatImages.size}</span>
                )}
                {t === 'device' && deviceFiles.length > 0 && (
                  <span className="ml-1 px-1 py-0.5 bg-[#5b8def] text-white rounded-full text-[10px]">{deviceFiles.length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="p-2.5 bg-white">
            {photoTab === 'chat' ? (
              availableChatImages.length === 0 ? (
                <p className="text-xs text-[#9ab0cc] text-center py-3">No new images found in chat.</p>
              ) : (
                <div className="grid grid-cols-4 gap-1 max-h-48 overflow-y-auto">
                  {availableChatImages.map((img) => {
                    const sel = selectedChatImages.has(img.id)
                    return (
                      <button
                        key={img.id}
                        onClick={() => toggleChatImage(img.id)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${sel ? 'border-[#5b8def]' : 'border-transparent'}`}
                      >
                        <img src={img.media_url} alt="" className="w-full h-full object-cover" />
                        {sel && (
                          <div className="absolute inset-0 bg-[#5b8def]/30 flex items-center justify-center">
                            <Check size={14} className="text-white" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center gap-1.5 py-4 border-2 border-dashed border-[#dce7f8] rounded-xl text-[#9ab0cc] hover:border-[#5b8def]/40 hover:text-[#5b8def] transition-colors mb-2"
                >
                  <Upload size={16} />
                  <span className="text-xs">Click to upload images</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleDeviceFiles} />
                {deviceFiles.length > 0 && (
                  <div className="grid grid-cols-4 gap-1">
                    {deviceFiles.map((f, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-[#dce7f8]">
                        <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => setDeviceFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center text-[#6b84ab] hover:text-red-400 shadow-sm"
                        >
                          <X size={9} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-2.5">
              <button
                onClick={() => { setShowAddPhotos(false); setSelectedChatImages(new Set()); setDeviceFiles([]) }}
                className="flex-1 py-1.5 text-xs text-[#6b84ab] border border-[#dce7f8] rounded-lg hover:bg-[#f3f7ff] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPhotos}
                disabled={selectedCount === 0 || uploading || adding}
                className="flex-1 py-1.5 text-xs font-medium bg-[#5b8def] text-white rounded-lg disabled:opacity-50 transition-opacity"
              >
                {uploading || adding ? 'Adding…' : `Add ${selectedCount > 0 ? selectedCount : ''} photo${selectedCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-[#9ab0cc] text-center py-4">Loading…</p>
      ) : media.length === 0 ? (
        <p className="text-xs text-[#9ab0cc] text-center py-4">No photos yet. Tap "Add photos" to get started.</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {media.map((m) => (
            <a key={m.id} href={m.media_url} target="_blank" rel="noreferrer">
              <img src={m.media_url} alt="" className="w-full aspect-square object-cover rounded-lg hover:opacity-90 transition-opacity" />
            </a>
          ))}
        </div>
      )}

      <Dialog.Root open={pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(false) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-[#1a2744]/30 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-2xl shadow-xl shadow-[#1a2744]/12 border border-[#dce7f8] p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-[#1a2744]">Delete Album</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[#9ab0cc]">
                  "{album.name}" will be permanently deleted.
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-[#dce7f8] text-sm font-medium text-[#6b84ab] hover:bg-[#edf1fa] transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => { deleteAlbum(album.id); setPendingDelete(false); onBack() }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-medium text-white transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function CreateAlbumForm({ conversationId, currentUserId, onDone }: { conversationId: string; currentUserId: string; onDone: () => void }) {
  const [name, setName] = useState('')
  const { mutate: create, isPending } = useCreateAlbum(conversationId)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    create({ name: name.trim(), createdBy: currentUserId }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} className="mb-3 flex gap-2">
      <input
        autoFocus
        type="text"
        placeholder="Album name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 px-3 py-1.5 text-sm bg-[#f3f7ff] rounded-lg text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
      />
      <button type="submit" disabled={isPending || !name.trim()} className="px-3 py-1.5 text-xs font-medium bg-[#5b8def] text-white rounded-lg disabled:opacity-50">
        Add
      </button>
      <button type="button" onClick={onDone} className="text-[#9ab0cc] hover:text-[#6b84ab]">
        <X size={15} />
      </button>
    </form>
  )
}

export default function AlbumList({ conversationId, currentUserId }: Props) {
  const { data: albums = [], isLoading } = useAlbums(conversationId)
  const [selected, setSelected] = useState<Album | null>(null)
  const [creating, setCreating] = useState(false)

  if (selected) {
    return (
      <AlbumGallery
        album={selected}
        conversationId={conversationId}
        currentUserId={currentUserId}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-[#9ab0cc] uppercase tracking-wide">Albums</span>
        {!creating && (
          <button onClick={() => setCreating(true)} className="text-[#9ab0cc] hover:text-[#5b8def] transition-colors">
            <Plus size={14} />
          </button>
        )}
      </div>
      {creating && <CreateAlbumForm conversationId={conversationId} currentUserId={currentUserId} onDone={() => setCreating(false)} />}
      {isLoading ? (
        <p className="text-xs text-[#9ab0cc] py-4 text-center">Loading…</p>
      ) : !albums.length && !creating ? (
        <div className="py-6 text-center">
          <Image size={24} className="mx-auto text-[#dce7f8] mb-2" />
          <p className="text-xs text-[#9ab0cc]">No albums yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {albums.map((a) => {
            const coverUrl = a.album_media?.[0]?.media_url ?? null
            return (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className="flex flex-col items-center gap-2 p-3 border border-[#dce7f8] rounded-xl hover:bg-[#f3f7ff] transition-colors text-left"
              >
                <div className="w-full aspect-square bg-[#edf1fa] rounded-lg overflow-hidden flex items-center justify-center">
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Image size={24} className="text-[#9ab0cc]" />
                  )}
                </div>
                <p className="text-xs font-medium text-[#1a2744] truncate w-full text-center">{a.name}</p>
                <p className="text-[10px] text-[#b0c0d8] text-center">by {a.creator?.display_name ?? a.creator?.username ?? 'Unknown'}</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
