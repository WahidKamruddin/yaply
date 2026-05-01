import { useState, useRef, useCallback, type KeyboardEvent } from 'react'
import { Paperclip, Smile, Send, X } from 'lucide-react'
import { useAtom } from 'jotai'
import { replyToMessageIdAtom } from '@/features/chat/store/chat.atoms'
import type { DecryptedMessage } from '@/features/chat/types'

interface Props {
  onSend: (text: string) => void
  onAttachment?: () => void
  replyMessage?: DecryptedMessage | null
  disabled?: boolean
}

export default function MessageInput({ onSend, onAttachment, replyMessage, disabled }: Props) {
  const [text, setText] = useState('')
  const [showCommands, setShowCommands] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [, setReplyId] = useAtom(replyToMessageIdAtom)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setText(value)
    setShowCommands(value.startsWith('/'))

    // Auto-resize
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submit()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text],
  )

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return

    if (trimmed.startsWith('/')) {
      const [rawName, ...args] = trimmed.slice(1).split(' ')
      const name = rawName?.toLowerCase() ?? ''
      window.dispatchEvent(
        new CustomEvent('yaply:command', { detail: { name, args, rawArgs: args.join(' ') } }),
      )
      setText('')
      setShowCommands(false)
      return
    }

    onSend(trimmed)
    setText('')
    setShowCommands(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  return (
    <div className="border-t border-slate-700/50 bg-[#1e293b] px-4 py-3">
      {/* Reply strip */}
      {replyMessage && (
        <div className="flex items-center justify-between mb-2 px-3 py-2 bg-slate-800 rounded-lg border-l-2 border-amber-500">
          <div className="min-w-0">
            <p className="text-xs text-amber-400 font-medium">Replying to {replyMessage.senderProfile?.username ?? 'message'}</p>
            <p className="text-xs text-slate-400 truncate">{replyMessage.content}</p>
          </div>
          <button onClick={() => setReplyId(null)} className="text-slate-500 hover:text-slate-300 ml-2 flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Command palette */}
      {showCommands && (
        <div className="mb-2 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
          <div className="px-3 py-2 border-b border-slate-700">
            <span className="text-xs text-slate-500 font-medium">COMMANDS</span>
          </div>
          {[
            { name: 'remind', desc: 'Set a reminder' },
            { name: 'mute', desc: 'Mute conversation' },
            { name: 'thread', desc: 'Start a thread' },
            { name: 'create', desc: 'Create task/poll/event/note/album/budget' },
            { name: 'plan', desc: 'Create a plan' },
            { name: 'help', desc: 'Show all commands' },
          ].map((cmd) => (
            <button
              key={cmd.name}
              className="w-full flex items-baseline gap-3 px-3 py-2 hover:bg-slate-700 transition-colors text-left"
              onClick={() => {
                setText(`/${cmd.name} `)
                setShowCommands(false)
                textareaRef.current?.focus()
              }}
            >
              <span className="text-sm text-amber-400 font-mono font-medium">/{cmd.name}</span>
              <span className="text-xs text-slate-400">{cmd.desc}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={onAttachment}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
        >
          <Paperclip size={18} />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message... (/ for commands)"
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-slate-800 rounded-2xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-amber-500/50 transition max-h-40 leading-relaxed disabled:opacity-50"
        />

        <button
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
        >
          <Smile size={18} />
        </button>

        <button
          onClick={submit}
          disabled={!text.trim() || disabled}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
