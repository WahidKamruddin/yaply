import { X } from 'lucide-react'
import { COMMANDS } from '@yaply/shared/constants/commands'
import type { CommandCategory } from '@yaply/shared/constants/commands'

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  utility:      'Utility',
  productivity: 'Productivity',
  social:       'Social',
}

const CATEGORY_ORDER: CommandCategory[] = ['utility', 'productivity', 'social']

const grouped = CATEGORY_ORDER.map((cat) => ({
  cat,
  label: CATEGORY_LABELS[cat],
  commands: COMMANDS.filter((c) => c.category === cat),
})).filter((g) => g.commands.length > 0)

interface Props {
  onClose: () => void
}

export default function HelpModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Scrim */}
      <div className="absolute inset-0 bg-[#1a2744]/10 backdrop-blur-[1px]" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl shadow-[#1a2744]/10 border border-[#dce7f8] max-h-[80vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#dce7f8] flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-[#1a2744] tracking-tight">Commands</h2>
            <p className="text-xs text-[#9ab0cc] mt-0.5">Type <span className="font-mono text-[#5b8def]">/</span> in any conversation to get started</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-[#1a2744] hover:bg-[#edf1fa] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Command groups */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {grouped.map(({ cat, label, commands }) => (
            <div key={cat}>
              <p className="text-[10px] font-semibold text-[#9ab0cc] uppercase tracking-widest mb-2">
                {label}
              </p>
              <div className="space-y-1">
                {commands.map((cmd) => (
                  <div
                    key={cmd.name}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-[#f3f7ff] transition-colors group"
                  >
                    {/* Usage slug */}
                    <span className="flex-shrink-0 w-36 font-mono text-xs font-semibold text-[#5b8def] pt-0.5">
                      {cmd.usage}
                    </span>

                    {/* Description + example */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#1a2744] font-medium leading-snug">{cmd.description}</p>
                      {cmd.example && (
                        <p className="text-[11px] text-[#9ab0cc] font-mono mt-0.5 truncate">{cmd.example}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="px-5 py-3 border-t border-[#dce7f8] flex-shrink-0">
          <p className="text-[11px] text-[#9ab0cc] text-center">
            Command outputs are only visible to you — not sent to the conversation
          </p>
        </div>
      </div>
    </div>
  )
}
