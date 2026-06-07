import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, Calendar, CheckSquare, BarChart2, FileText, Image, DollarSign, Map, Upload, MessageSquare, Check } from 'lucide-react'
import type { CreateItemType } from '../handlers/createHandler'
import { supabase } from '@/lib/supabase'
import { useEvents } from '@/features/chat/hooks/useEvents'
import { useConversationImages } from '@/features/chat/hooks/useAlbums'
import { uploadMediaFile } from '@/features/media/api/upload'

interface Props {
  type: CreateItemType
  initialTitle?: string
  conversationId: string
  userId: string
  onClose: () => void
  onCreated: (systemMessage: string) => void
}

const icons: Record<CreateItemType, React.ReactNode> = {
  task:   <CheckSquare size={18} className="text-[#5b8def]" />,
  poll:   <BarChart2   size={18} className="text-[#5b8def]" />,
  event:  <Calendar    size={18} className="text-[#5b8def]" />,
  note:   <FileText    size={18} className="text-[#5b8def]" />,
  album:  <Image       size={18} className="text-[#5b8def]" />,
  budget: <DollarSign  size={18} className="text-[#5b8def]" />,
  plan:   <Map         size={18} className="text-[#5b8def]" />,
}

const LINKABLE: CreateItemType[] = ['album', 'note', 'budget']

const QUERY_KEY_MAP: Partial<Record<CreateItemType, string>> = {
  task:   'tasks',
  note:   'notes',
  album:  'albums',
  budget: 'budgets',
  plan:   'events',
  event:  'events',
}

export default function CommandModal({ type, initialTitle = '', conversationId, userId, onClose, onCreated }: Props) {
  const qc = useQueryClient()
  const [title, setTitle]             = useState(initialTitle)
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt]             = useState('')
  const [location, setLocation]       = useState('')
  const [amount, setAmount]           = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [eventId, setEventId]         = useState<string>('')
  const [saving, setSaving]           = useState(false)

  // Album-specific image state
  const [photoTab, setPhotoTab]               = useState<'chat' | 'device'>('chat')
  const [selectedChatImages, setSelectedChatImages] = useState<Set<string>>(new Set())
  const [deviceFiles, setDeviceFiles]         = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: existingEvents = [] } = useEvents(LINKABLE.includes(type) ? conversationId : null)
  const { data: chatImages = [] }     = useConversationImages(type === 'album' ? conversationId : null)

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const linkedEventId = eventId || null

      if (type === 'task') {
        await supabase.from('tasks').insert({
          conversation_id: conversationId,
          created_by: userId,
          title,
          description: description || null,
          due_at: dueAt || null,
          status: 'todo',
        })
        onCreated(`📋 Task created: "${title}"`)

      } else if (type === 'note') {
        await supabase.from('notes').insert({
          conversation_id: conversationId,
          user_id: userId,
          title,
          content: description || '',
          event_id: linkedEventId,
        })
        onCreated(`📝 Note created: "${title}"`)

      } else if (type === 'album') {
        const { data: album, error } = await supabase
          .from('albums')
          .insert({ conversation_id: conversationId, created_by: userId, name: title, event_id: linkedEventId })
          .select()
          .single()
        if (error) throw error

        // Add selected chat images
        const chatImgList = chatImages.filter((img) => selectedChatImages.has(img.id))
        for (const img of chatImgList) {
          await supabase.from('album_media').insert({
            album_id: album.id,
            message_id: img.id,
            media_url: img.media_url,
            media_mime: img.media_mime,
          })
        }

        // Upload + add device files
        for (const file of deviceFiles) {
          const { publicUrl } = await uploadMediaFile(file, userId)
          await supabase.from('album_media').insert({
            album_id: album.id,
            message_id: null,
            media_url: publicUrl,
            media_mime: file.type || 'image/jpeg',
          })
        }

        const photoCount = selectedChatImages.size + deviceFiles.length
        onCreated(`📸 Album created: "${title}"${photoCount > 0 ? ` (${photoCount} photo${photoCount !== 1 ? 's' : ''})` : ''}`)

      } else if (type === 'budget') {
        await supabase.from('budgets').insert({
          conversation_id: conversationId,
          created_by: userId,
          name: title,
          total_amount: parseFloat(amount),
          currency: 'USD',
          event_id: linkedEventId,
        })
        onCreated(`💰 Budget created: "${title}"${amount ? ` ($${amount})` : ''}`)

      } else if (type === 'plan') {
        await supabase.from('events').insert({
          conversation_id: conversationId,
          created_by: userId,
          name: title,
          description: description || null,
          status: 'planning',
          starts_at: null,
        })
        onCreated(`🗓️ Plan created: "${title}" — open the Events panel to set availability`)

      } else if (type === 'event') {
        if (!dueAt) { setSaving(false); return }
        await supabase.from('events').insert({
          conversation_id: conversationId,
          created_by: userId,
          name: title,
          description: description || null,
          location: location || null,
          status: 'confirmed',
          starts_at: new Date(dueAt).toISOString(),
        })
        onCreated(`📅 Event created: "${title}"`)

      } else {
        onCreated(`✅ ${type.charAt(0).toUpperCase() + type.slice(1)} created: "${title}"`)
      }

      const key = QUERY_KEY_MAP[type]
      if (key) void qc.invalidateQueries({ queryKey: [key, conversationId] })

      onClose()
    } finally {
      setSaving(false)
    }
  }

  const isEventRequired = type === 'event' && !dueAt

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white border border-[#dce7f8] rounded-2xl shadow-2xl shadow-[#dce7f8]/60 w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#dce7f8] flex-shrink-0">
          <h2 className="text-base font-semibold text-[#1a2744] flex items-center gap-2">
            {icons[type]}
            {type === 'plan' ? 'New Plan' : type.charAt(0).toUpperCase() + type.slice(1)}
          </h2>
          <button onClick={onClose} className="text-[#9ab0cc] hover:text-[#1a2744] transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-3 overflow-y-auto">
          {/* Title — not shown for polls */}
          {type !== 'poll' && (
            <input
              required
              type="text"
              placeholder={type === 'plan' ? 'Plan name' : type === 'event' ? 'Event name' : 'Title'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
            />
          )}

          {/* Description */}
          {(['task', 'note', 'event', 'plan'] as CreateItemType[]).includes(type) && (
            <textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40 resize-none"
            />
          )}

          {/* Date/time */}
          {(type === 'task' || type === 'event') && (
            <div>
              <label className="text-xs text-[#9ab0cc] mb-1 block">
                {type === 'event' ? 'Date & time *' : 'Due date (optional)'}
              </label>
              <input
                type="datetime-local"
                required={type === 'event'}
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full px-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
              />
            </div>
          )}

          {/* Location */}
          {type === 'event' && (
            <input
              type="text"
              placeholder="Location (optional)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
            />
          )}

          {/* Budget amount */}
          {type === 'budget' && (
            <input
              required
              type="number"
              placeholder="Total budget amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0.01"
              step="0.01"
              className="w-full px-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
            />
          )}

          {/* Poll options */}
          {type === 'poll' && (
            <div className="space-y-2">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    placeholder={`Option ${i + 1}`}
                    value={opt}
                    onChange={(e) => setPollOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                    className="flex-1 px-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
                  />
                  {pollOptions.length > 2 && (
                    <button type="button" onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))} className="text-[#9ab0cc] hover:text-red-400">
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setPollOptions((prev) => [...prev, ''])} className="text-xs text-[#5b8def] hover:text-[#4a7de4]">
                + Add option
              </button>
            </div>
          )}

          {/* Album: photo picker */}
          {type === 'album' && (
            <div className="border border-[#dce7f8] rounded-xl overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-[#dce7f8]">
                <button
                  type="button"
                  onClick={() => setPhotoTab('chat')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                    photoTab === 'chat' ? 'bg-[#edf3ff] text-[#5b8def]' : 'text-[#9ab0cc] hover:text-[#6b84ab]'
                  }`}
                >
                  <MessageSquare size={12} /> From chat
                  {selectedChatImages.size > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-[#5b8def] text-white text-[10px] rounded-full leading-none">
                      {selectedChatImages.size}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoTab('device')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                    photoTab === 'device' ? 'bg-[#edf3ff] text-[#5b8def]' : 'text-[#9ab0cc] hover:text-[#6b84ab]'
                  }`}
                >
                  <Upload size={12} /> From device
                  {deviceFiles.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-[#5b8def] text-white text-[10px] rounded-full leading-none">
                      {deviceFiles.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Chat images grid */}
              {photoTab === 'chat' && (
                <div className="p-2">
                  {chatImages.length === 0 ? (
                    <p className="text-xs text-[#9ab0cc] text-center py-4">No images in this conversation yet.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-1 max-h-48 overflow-y-auto">
                      {chatImages.map((img) => {
                        const selected = selectedChatImages.has(img.id)
                        return (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => toggleChatImage(img.id)}
                            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                              selected ? 'border-[#5b8def]' : 'border-transparent'
                            }`}
                          >
                            <img src={img.media_url} alt="" className="w-full h-full object-cover" />
                            {selected && (
                              <div className="absolute inset-0 bg-[#5b8def]/30 flex items-center justify-center">
                                <div className="w-5 h-5 rounded-full bg-[#5b8def] flex items-center justify-center">
                                  <Check size={11} className="text-white" />
                                </div>
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Device upload */}
              {photoTab === 'device' && (
                <div className="p-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleDeviceFiles}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3 border-2 border-dashed border-[#dce7f8] rounded-lg text-xs text-[#9ab0cc] hover:border-[#5b8def]/50 hover:text-[#5b8def] transition-colors flex items-center justify-center gap-2"
                  >
                    <Upload size={14} /> Choose photos
                  </button>
                  {deviceFiles.length > 0 && (
                    <div className="grid grid-cols-4 gap-1 mt-2">
                      {deviceFiles.map((f, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden group">
                          <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setDeviceFiles((prev) => prev.filter((_, j) => j !== i))}
                            className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={9} className="text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Link to event — for album, note, budget */}
          {LINKABLE.includes(type) && existingEvents.length > 0 && (
            <div>
              <label className="text-xs text-[#9ab0cc] mb-1 block">Link to event (optional)</label>
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full px-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
              >
                <option value="">None</option>
                {existingEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[#6b84ab] hover:text-[#1a2744] transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || isEventRequired}
              className="px-4 py-2 text-sm font-medium bg-[#5b8def] hover:bg-[#4a7de4] text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
