import { useState } from 'react'
import { X, Calendar, CheckSquare, BarChart2, FileText, Image, DollarSign, Map } from 'lucide-react'
import type { CreateItemType } from '../handlers/createHandler'
import { supabase } from '@/lib/supabase'

interface Props {
  type: CreateItemType
  initialTitle?: string
  conversationId: string
  userId: string
  onClose: () => void
  onCreated: (systemMessage: string) => void
}

const icons: Record<CreateItemType, React.ReactNode> = {
  task: <CheckSquare size={18} className="text-[#5b8def]" />,
  poll: <BarChart2 size={18} className="text-[#5b8def]" />,
  event: <Calendar size={18} className="text-[#5b8def]" />,
  note: <FileText size={18} className="text-[#5b8def]" />,
  album: <Image size={18} className="text-[#5b8def]" />,
  budget: <DollarSign size={18} className="text-[#5b8def]" />,
  plan: <Map size={18} className="text-[#5b8def]" />,
}

export default function CommandModal({ type, initialTitle = '', conversationId, userId, onClose, onCreated }: Props) {
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [amount, setAmount] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title) return
    setSaving(true)
    try {
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
          created_by: userId,
          title,
          content: description || null,
        })
        onCreated(`📝 Note created: "${title}"`)
      } else if (type === 'album') {
        await supabase.from('albums').insert({
          conversation_id: conversationId,
          created_by: userId,
          title,
          media_refs: [],
        })
        onCreated(`📸 Album created: "${title}"`)
      } else if (type === 'budget') {
        await supabase.from('budgets').insert({
          conversation_id: conversationId,
          created_by: userId,
          title,
          amount: amount ? parseFloat(amount) : null,
        })
        onCreated(`💰 Budget created: "${title}"${amount ? ` ($${amount})` : ''}`)
      } else {
        onCreated(`✅ ${type.charAt(0).toUpperCase() + type.slice(1)} created: "${title}"`)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white border border-[#dce7f8] rounded-2xl shadow-2xl shadow-[#dce7f8]/60 w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#dce7f8]">
          <h2 className="text-base font-semibold text-[#1a2744] flex items-center gap-2">
            {icons[type]}
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </h2>
          <button onClick={onClose} className="text-[#9ab0cc] hover:text-[#1a2744] transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-3">
          <input
            required
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
          />

          {(type === 'task' || type === 'note' || type === 'event' || type === 'plan') && (
            <textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40 resize-none"
            />
          )}

          {(type === 'task' || type === 'event' || type === 'plan') && (
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full px-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
            />
          )}

          {type === 'budget' && (
            <input
              type="number"
              placeholder="Amount (optional)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 bg-[#f3f7ff] rounded-lg text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
            />
          )}

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
                    <button
                      type="button"
                      onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                      className="text-[#9ab0cc] hover:text-red-400"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPollOptions((prev) => [...prev, ''])}
                className="text-xs text-[#5b8def] hover:text-[#4a7de4]"
              >
                + Add option
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[#6b84ab] hover:text-[#1a2744] transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
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
