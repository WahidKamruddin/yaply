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
  task: <CheckSquare size={18} className="text-amber-400" />,
  poll: <BarChart2 size={18} className="text-amber-400" />,
  event: <Calendar size={18} className="text-amber-400" />,
  note: <FileText size={18} className="text-amber-400" />,
  album: <Image size={18} className="text-amber-400" />,
  budget: <DollarSign size={18} className="text-amber-400" />,
  plan: <Map size={18} className="text-amber-400" />,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            {icons[type]}
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
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
            className="w-full px-3 py-2 bg-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-amber-500/50"
          />

          {(type === 'task' || type === 'note' || type === 'event' || type === 'plan') && (
            <textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-amber-500/50 resize-none"
            />
          )}

          {(type === 'task' || type === 'event' || type === 'plan') && (
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 rounded-lg text-sm text-slate-300 outline-none focus:ring-1 focus:ring-amber-500/50"
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
              className="w-full px-3 py-2 bg-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-amber-500/50"
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
                    className="flex-1 px-3 py-2 bg-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-amber-500/50"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                      className="text-slate-500 hover:text-red-400"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPollOptions((prev) => [...prev, ''])}
                className="text-xs text-amber-400 hover:text-amber-300"
              >
                + Add option
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-400 text-black rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
