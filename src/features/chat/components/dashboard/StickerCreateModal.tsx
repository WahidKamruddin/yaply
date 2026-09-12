import * as Dialog from '@radix-ui/react-dialog'
import { Sticker, X } from 'lucide-react'
import StickerCreator from '@/features/media/components/StickerCreator'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (blob: Blob, name: string) => Promise<void>
}

export default function StickerCreateModal({ open, onClose, onCreated }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md max-h-[90vh] flex flex-col bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <Dialog.Title className="text-base font-semibold text-text flex items-center gap-2">
              <Sticker size={18} className="text-primary" />
              New Sticker
            </Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Close" className="text-text-subtle hover:text-text transition-colors">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          <div className="p-5 overflow-y-auto">
            <StickerCreator onCreated={onCreated} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
