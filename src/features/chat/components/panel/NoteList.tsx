import { useState } from 'react'
import { Trash2, ChevronDown, ChevronUp, Plus, X, Lock, Unlock } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Note } from '../../hooks/useNotes'
import { useNotes, useDeleteNote, useCreateNote, useLockNote } from '../../hooks/useNotes'

interface Props {
  conversationId: string
  currentUserId: string
  isCurrentUserAdmin: boolean
}

function NoteCard({ note, currentUserId, isCurrentUserAdmin }: { note: Note; currentUserId: string; isCurrentUserAdmin: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const { mutate: deleteNote } = useDeleteNote()
  const { mutate: lockNote } = useLockNote()
  const canDelete = note.user_id === currentUserId || isCurrentUserAdmin
  const isLocked = note.locked
  const canInteract = !isLocked || isCurrentUserAdmin

  return (
    <>
      <div className="border border-border rounded-xl mb-2 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-tint transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {isLocked && <Lock size={10} className="text-amber-400 flex-shrink-0" />}
            <span className="text-sm font-medium text-text truncate pr-2">{note.title}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-text-subtle">by {note.creator?.display_name ?? note.creator?.username ?? 'Unknown'}</span>
            <span className="text-xs text-text-subtle">· {new Date(note.created_at).toLocaleDateString()}</span>
            {expanded ? <ChevronUp size={14} className="text-text-subtle" /> : <ChevronDown size={14} className="text-text-subtle" />}
          </div>
        </button>
        {expanded && (
          <div className="px-3 pb-3 border-t border-border bg-tint">
            <p className="text-sm text-[#3d5a80] mt-2 whitespace-pre-wrap">{note.content || <em className="text-text-subtle">No content</em>}</p>
            <div className="flex items-center gap-3 mt-2">
              {canDelete && (
                <button
                  disabled={!canInteract}
                  className={`flex items-center gap-1 text-xs transition-colors ${canInteract ? 'text-red-400 hover:text-red-500' : 'text-text-subtle opacity-40 cursor-not-allowed'}`}
                  onClick={() => canInteract && setShowConfirm(true)}
                >
                  <Trash2 size={12} /> Delete
                </button>
              )}
              {isCurrentUserAdmin && (
                <button
                  onClick={() => lockNote({ noteId: note.id, locked: !isLocked })}
                  className="flex items-center gap-1 text-xs text-text-subtle hover:text-amber-400 transition-colors"
                >
                  {isLocked ? <><Unlock size={12} /> Unlock</> : <><Lock size={12} /> Lock</>}
                </button>
              )}
              {isLocked && !isCurrentUserAdmin && (
                <span className="flex items-center gap-1 text-xs text-amber-400"><Lock size={10} /> Locked by admin</span>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog.Root open={showConfirm} onOpenChange={setShowConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-card rounded-2xl shadow-xl shadow-black/40 border border-border p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-text">Delete Note</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-text-subtle">
                  "{note.title}" will be permanently deleted.
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-text-muted hover:bg-tint transition-colors">
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
    <form onSubmit={submit} className="mb-3 space-y-2 border border-border rounded-xl p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted">New note</span>
        <button type="button" onClick={onDone} className="text-text-subtle hover:text-text-muted"><X size={14} /></button>
      </div>
      <input
        autoFocus
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-1.5 text-sm bg-tint rounded-lg text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/40"
      />
      <textarea
        placeholder="Content (optional)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        className="w-full px-3 py-1.5 text-sm bg-tint rounded-lg text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/40 resize-none"
      />
      <button type="submit" disabled={isPending || !title.trim()} className="w-full py-1.5 text-xs font-medium bg-[#5b8def] text-white rounded-lg disabled:opacity-50">
        Save
      </button>
    </form>
  )
}

export default function NoteList({ conversationId, currentUserId, isCurrentUserAdmin }: Props) {
  const { data: notes = [], isLoading } = useNotes(conversationId)
  const [creating, setCreating] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-text-subtle uppercase tracking-wide">Notes</span>
        {!creating && (
          <button onClick={() => setCreating(true)} className="text-text-subtle hover:text-[#5b8def] transition-colors">
            <Plus size={14} />
          </button>
        )}
      </div>
      {creating && <CreateNoteForm conversationId={conversationId} currentUserId={currentUserId} onDone={() => setCreating(false)} />}
      {isLoading ? (
        <p className="text-xs text-text-subtle py-4 text-center">Loading…</p>
      ) : !notes.length && !creating ? (
        <p className="text-xs text-text-subtle text-center py-6">No notes yet.</p>
      ) : (
        <div>{notes.map((n) => <NoteCard key={n.id} note={n} currentUserId={currentUserId} isCurrentUserAdmin={isCurrentUserAdmin} />)}</div>
      )}
    </div>
  )
}
