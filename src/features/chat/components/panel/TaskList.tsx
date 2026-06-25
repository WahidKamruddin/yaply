import { useState } from 'react'
import { CheckSquare, Square, Clock, Trash2, Plus, X, Lock, Unlock, Pencil } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Task } from '../../hooks/useTasks'
import { useTasks, useUpdateTaskStatus, useCreateTask, useDeleteTask, useLockTask, useUpdateTaskDueDate } from '../../hooks/useTasks'

interface Props {
  conversationId: string
  currentUserId: string
  isCurrentUserAdmin: boolean
}

function TaskItem({ task, currentUserId, isCurrentUserAdmin }: { task: Task; currentUserId: string; isCurrentUserAdmin: boolean }) {
  const { mutate: updateStatus } = useUpdateTaskStatus()
  const { mutate: deleteTask } = useDeleteTask()
  const { mutate: lockTask } = useLockTask()
  const { mutate: updateDueDate } = useUpdateTaskDueDate()
  const [showConfirm, setShowConfirm] = useState(false)
  const [editingDue, setEditingDue] = useState(false)
  const [dueValue, setDueValue] = useState(task.due_at ? task.due_at.slice(0, 16) : '')
  const isDone = task.status === 'done'
  const canDelete = task.created_by === currentUserId || isCurrentUserAdmin
  const isLocked = task.locked
  const canToggleStatus = !isLocked || isCurrentUserAdmin

  return (
    <>
      <div className="flex items-start gap-2.5 py-2.5 border-b border-[#dce7f8] last:border-0">
        <button
          className={`mt-0.5 flex-shrink-0 transition-colors ${canToggleStatus ? 'text-[#5b8def] hover:text-[#4a7de4]' : 'text-[#dce7f8] cursor-not-allowed'}`}
          onClick={() => canToggleStatus && updateStatus({ taskId: task.id, status: isDone ? 'todo' : 'done' })}
          disabled={!canToggleStatus}
        >
          {isDone ? <CheckSquare size={15} /> : <Square size={15} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${isDone ? 'line-through text-[#9ab0cc]' : 'text-[#1a2744]'}`}>{task.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] text-[#b0c0d8]">
              by {task.creator?.display_name ?? task.creator?.username ?? 'Unknown'}
            </span>
            {task.due_at && !editingDue && (
              <span className="text-[10px] text-[#b0c0d8] flex items-center gap-0.5">
                · <Clock size={9} className="inline mb-0.5" /> {new Date(task.due_at).toLocaleDateString()}
                {isCurrentUserAdmin && (
                  <button
                    onClick={() => { setDueValue(task.due_at?.slice(0, 16) ?? ''); setEditingDue(true) }}
                    className="ml-0.5 text-[#9ab0cc] hover:text-[#5b8def] transition-colors"
                  >
                    <Pencil size={9} />
                  </button>
                )}
              </span>
            )}
            {!task.due_at && isCurrentUserAdmin && !editingDue && (
              <button
                onClick={() => setEditingDue(true)}
                className="text-[10px] text-[#9ab0cc] hover:text-[#5b8def] flex items-center gap-0.5 transition-colors"
              >
                <Pencil size={9} /> set due date
              </button>
            )}
          </div>
          {editingDue && (
            <div className="flex items-center gap-1.5 mt-1">
              <input
                type="datetime-local"
                value={dueValue}
                onChange={(e) => setDueValue(e.target.value)}
                className="text-xs bg-[#f3f7ff] rounded px-2 py-0.5 text-[#1a2744] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
              />
              <button
                onClick={() => { updateDueDate({ taskId: task.id, dueAt: dueValue ? new Date(dueValue).toISOString() : null }); setEditingDue(false) }}
                className="text-xs text-[#5b8def] font-medium hover:text-[#4a7de4] transition-colors"
              >Save</button>
              <button onClick={() => setEditingDue(false)} className="text-[#9ab0cc] hover:text-[#6b84ab]"><X size={12} /></button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isLocked && <Lock size={11} className="text-amber-400" />}
          {isCurrentUserAdmin && (
            <button
              onClick={() => lockTask({ taskId: task.id, locked: !isLocked })}
              title={isLocked ? 'Unlock' : 'Lock'}
              className="text-[#c5d5e8] hover:text-amber-400 transition-colors"
            >
              {isLocked ? <Unlock size={12} /> : <Lock size={12} />}
            </button>
          )}
          <button
            onClick={() => canDelete && !isLocked && setShowConfirm(true)}
            disabled={!canDelete || (isLocked && !isCurrentUserAdmin)}
            className={`transition-colors ${canDelete && !(isLocked && !isCurrentUserAdmin) ? 'text-[#c5d5e8] hover:text-red-400' : 'text-[#dce7f8] opacity-40 cursor-not-allowed'}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
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

export default function TaskList({ conversationId, currentUserId, isCurrentUserAdmin }: Props) {
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
        <div>{tasks.map((t) => <TaskItem key={t.id} task={t} currentUserId={currentUserId} isCurrentUserAdmin={isCurrentUserAdmin} />)}</div>
      )}
    </div>
  )
}
