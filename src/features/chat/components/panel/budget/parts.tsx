import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { formatMoney } from '@yaply/shared'

export const inputClass =
  'w-full px-2.5 py-1.5 bg-tint rounded-lg text-xs text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/40'

export const primaryButtonClass =
  'w-full py-2 bg-[#5b8def] hover:bg-[#4a7de4] text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors'

/** Spent vs. cap. Turns red once over. */
export function CapBar({ spent, cap, className = '' }: { spent: number; cap: number; className?: string }) {
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0
  const over = spent > cap
  return (
    <div
      className={`h-1.5 rounded-full bg-tint-strong overflow-hidden ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className={`h-full rounded-full ${over ? 'bg-red-500' : 'bg-[#5b8def]'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** The viewer's own position: owed (green), owes (red) or settled. */
export function NetLabel({ net, currency, className = '' }: { net: number; currency: string; className?: string }) {
  if (Math.abs(net) < 0.005) return <p className={`text-text-subtle ${className}`}>You're all settled up</p>
  return net > 0 ? (
    <p className={`text-green-500 ${className}`}>You're owed {formatMoney(net, currency)}</p>
  ) : (
    <p className={`text-red-500 ${className}`}>You owe {formatMoney(-net, currency)}</p>
  )
}

/** Centred form dialog, same chrome as the app's confirm dialogs. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: React.ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-sm max-h-[85vh] overflow-y-auto bg-card rounded-2xl shadow-xl shadow-black/40 border border-border p-5 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-text">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-text-subtle hover:text-text-muted" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
