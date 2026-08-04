import * as Dialog from '@radix-ui/react-dialog'
import type { LucideIcon } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  Icon: LucideIcon
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  /** Destructive styling (red icon chip + red confirm). Default true. */
  destructive?: boolean
  busy?: boolean
}

/**
 * The confirmation dialog shape used across the app (MessageBubble, TaskList,
 * GroupInfoModal …): centred column, 48px icon chip, title + description, then a
 * 50/50 Cancel / confirm row. Factored out here because the friends feature
 * needs it four times over.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  Icon,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = true,
  busy = false,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-card rounded-2xl shadow-xl shadow-black/40 border border-border p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex flex-col items-center text-center gap-4">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                destructive ? 'bg-danger-tint' : 'bg-tint'
              }`}
            >
              <Icon size={20} className={destructive ? 'text-danger' : 'text-[#5b8def]'} />
            </div>
            <div>
              <Dialog.Title className="text-base font-semibold text-text">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-muted">
                {description}
              </Dialog.Description>
            </div>
            <div className="flex gap-3 w-full mt-1">
              <Dialog.Close asChild>
                <button className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-text-muted hover:bg-tint transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={onConfirm}
                disabled={busy}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  destructive ? 'bg-red-500 hover:bg-red-600' : 'bg-[#5b8def] hover:bg-[#4a7de4]'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
