import { useState } from 'react'
import { CheckSquare, Square, Clock, Trash2, Plus, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Task } from '../../hooks/useTasks'
import { useTasks, useUpdateTaskStatus, useCreateTask, useDeleteTask } from '../../hooks/useTasks'

interface Props {
  conversationId: string
  currentUserId: string
}

function TaskItem({ task, currentUserId }: { task: Task; currentUserId: string }) {
  const { mutate: updateStatus } = useUpdateTaskStatus()
  const { mutate: deleteTask } = useDeleteTask()
  const [showConfirm, setShowConfirm] = useState(false)
  const isDone = task.status === 'done'
  const canDelete = task.created_by === currentUserId

  return (
    <>
      <div className="flex items-start gap-2.5 py-2.5 border-b border-[#dce7f8] last:border-0">
        <button
          className="mt-0.5 flex-shrink-0 text-[#5b8def] hover:text-[#4a7de4] transition-colors"
          onClick={() => updateStatus({ taskId: task.id, status: isDone ? 'todo' : 'done' })}
        >
          {isDone ? <CheckSquare size={15} /> : <Square size={15} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${isDone ? 'line-through text-[#9ab0cc]' : 'text-[#1a2744]'}`}>{task.title}</p>
          <p className="text-[10px] text-[#b0c0d8] mt-0.5">
            by {task.creator?.display_name ?? task.creator?.username ?? 'Unknown'}
            {task.due_at && <span> · <Clock size={9} className="inline mb-0.5" /> {new Date(task.due_at).toLocaleDateString()}</span>}
          </p>
        </div>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!canDelete}
          className={`flex-shrink-0 transition-colors ${canDelete ? 'text-[#c5d5e8] hover:text-red-400' : 'text-[#dce7f8] opacity-40 cursor-not-allowed'}`}
        >
          <Trash2 size={13} />
        </button>
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
                <Dialog.Title className="text-base font-semibold text-[#1a2744]">Delete Task</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[#9ab0cc]">
                  "{task.title}" will be permanently deleted.
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-[#dce7f8] text-sm font-medium text-[#6b84ab] hover:bg-[#edf1fa] transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => { deleteTask(task.id); setShowConfirm(false) }}
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

function CreateTaskForm({ conversationId, currentUserId, onDone }: { conversationId: string; currentUserId: string; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const { mutate: create, isPending } = useCreateTask(conversationId)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    create({ title: title.trim(), createdBy: currentUserId }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} className="mb-3 flex gap-2">
      <input
        autoFocus
        type="text"
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="flex-1 px-3 py-1.5 text-sm bg-[#f3f7ff] rounded-lg text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
      />
      <button type="submit" disabled={isPending || !title.trim()} className="px-3 py-1.5 text-xs font-medium bg-[#5b8def] text-white rounded-lg disabled:opacity-50">
        Add
      </button>
      <button type="button" onClick={onDone} className="text-[#9ab0cc] hover:text-[#6b84ab]">
        <X size={15} />
      </button>
    </form>
  )
}

export default function TaskList({ conversationId, currentUserId }: Props) {
  const { data: tasks = [], isLoading } = useTasks(conversationId)
  const [creating, setCreating] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-[#9ab0cc] uppercase tracking-wide">Tasks</span>
        {!creating && (
          <button onClick={() => setCreating(true)} className="text-[#9ab0cc] hover:text-[#5b8def] transition-colors">
            <Plus size={14} />
          </button>
        )}
      </div>
      {creating && <CreateTaskForm conversationId={conversationId} currentUserId={currentUserId} onDone={() => setCreating(false)} />}
      {isLoading ? (
        <p className="text-xs text-[#9ab0cc] py-4 text-center">Loading…</p>
      ) : !tasks.length && !creating ? (
        <p className="text-xs text-[#9ab0cc] text-center py-6">No tasks yet.</p>
      ) : (
        <div>{tasks.map((t) => <TaskItem key={t.id} task={t} currentUserId={currentUserId} />)}</div>
      )}
    </div>
  )
}
