import { useState } from 'react'
import { Trash2, ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Note } from '../../hooks/useNotes'
import { useNotes, useDeleteNote, useCreateNote } from '../../hooks/useNotes'

interface Props {
  conversationId: string
  currentUserId: string
}

function NoteCard({ note, currentUserId }: { note: Note; currentUserId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const { mutate: deleteNote } = useDeleteNote()
  const canDelete = note.user_id === currentUserId

  return (
    <>
      <div className="border border-[#dce7f8] rounded-xl mb-2 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-[#f3f7ff] transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="text-sm font-medium text-[#1a2744] truncate pr-2">{note.title}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-[#b0c0d8]">by {note.creator?.display_name ?? note.creator?.username ?? 'Unknown'}</span>
            <span className="text-xs text-[#9ab0cc]">· {new Date(note.created_at).toLocaleDateString()}</span>
            {expanded ? <ChevronUp size={14} className="text-[#9ab0cc]" /> : <ChevronDown size={14} className="text-[#9ab0cc]" />}
          </div>
        </button>
        {expanded && (
          <div className="px-3 pb-3 border-t border-[#dce7f8] bg-[#fafbff]">
            <p className="text-sm text-[#3d5a80] mt-2 whitespace-pre-wrap">{note.content || <em className="text-[#9ab0cc]">No content</em>}</p>
            <button
              disabled={!canDelete}
              className={`mt-2 flex items-center gap-1 text-xs transition-colors ${canDelete ? 'text-red-400 hover:text-red-500' : 'text-[#dce7f8] opacity-40 cursor-not-allowed'}`}
              onClick={() => canDelete && setShowConfirm(true)}
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        )}
      </div>

      <Dialog.Root open={showConfirm} onOpenChange={setShowConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-[#1a2744]/30 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-2xl shadow-xl shadow-[#1a2744]/12 border border-[#dce7f8] p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-[#1a2744]">Delete Note</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[#9ab0cc]">
                  "{note.title}" will be permanently deleted.
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-[#dce7f8] text-sm font-medium text-[#6b84ab] hover:bg-[#edf1fa] transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => { deleteNote(note.id); setShowConfirm(false) }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-medium text-white transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

function CreateNoteForm({ conversationId, currentUserId, onDone }: { conversationId: string; currentUserId: string; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const { mutate: create, isPending } = useCreateNote(conversationId)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    create({ title: title.trim(), content, userId: currentUserId }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} className="mb-3 space-y-2 border border-[#dce7f8] rounded-xl p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#6b84ab]">New note</span>
        <button type="button" onClick={onDone} className="text-[#9ab0cc] hover:text-[#6b84ab]"><X size={14} /></button>
      </div>
      <input
        autoFocus
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-1.5 text-sm bg-[#f3f7ff] rounded-lg text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
      />
      <textarea
        placeholder="Content (optional)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        className="w-full px-3 py-1.5 text-sm bg-[#f3f7ff] rounded-lg text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40 resize-none"
      />
      <button type="submit" disabled={isPending || !title.trim()} className="w-full py-1.5 text-xs font-medium bg-[#5b8def] text-white rounded-lg disabled:opacity-50">
        Save
      </button>
    </form>
  )
}

export default function NoteList({ conversationId, currentUserId }: Props) {
  const { data: notes = [], isLoading } = useNotes(conversationId)
  const [creating, setCreating] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-[#9ab0cc] uppercase tracking-wide">Notes</span>
        {!creating && (
          <button onClick={() => setCreating(true)} className="text-[#9ab0cc] hover:text-[#5b8def] transition-colors">
            <Plus size={14} />
          </button>
        )}
      </div>
      {creating && <CreateNoteForm conversationId={conversationId} currentUserId={currentUserId} onDone={() => setCreating(false)} />}
      {isLoading ? (
        <p className="text-xs text-[#9ab0cc] py-4 text-center">Loading…</p>
      ) : !notes.length && !creating ? (
        <p className="text-xs text-[#9ab0cc] text-center py-6">No notes yet.</p>
      ) : (
        <div>{notes.map((n) => <NoteCard key={n.id} note={n} currentUserId={currentUserId} />)}</div>
      )}
    </div>
  )
}
