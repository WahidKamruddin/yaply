import { useState, useRef, useCallback, type KeyboardEvent } from 'react'
import { Paperclip, Smile, Send, X } from 'lucide-react'
import { useAtom } from 'jotai'
import { replyToMessageIdAtom } from '@/features/chat/store/chat.atoms'
import type { DecryptedMessage } from '@/features/chat/types'

interface Props {
  onSend: (text: string) => void
  onAttachment?: () => void
  onTyping?: () => void
  onStopTyping?: () => void
  replyMessage?: DecryptedMessage | null
  disabled?: boolean
}

export default function MessageInput({ onSend, onAttachment, onTyping, onStopTyping, replyMessage, disabled }: Props) {
  const [text, setText] = useState('')
  const [showCommands, setShowCommands] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [, setReplyId] = useAtom(replyToMessageIdAtom)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setText(value)
    setShowCommands(value.startsWith('/'))
    if (value) onTyping?.()
    else onStopTyping?.()

    // Auto-resize
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    }
  }, [onTyping, onStopTyping])

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
    onStopTyping?.()
    setText('')
    setShowCommands(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  return (
    <div className="border-t border-[#dce7f8] bg-white px-4 py-3">
      {/* Reply strip */}
      {replyMessage && (
        <div className="flex items-center justify-between mb-2 px-3 py-2 bg-[#edf3ff] rounded-lg border-l-2 border-[#5b8def]">
          <div className="min-w-0">
            <p className="text-xs text-[#5b8def] font-medium">Replying to {replyMessage.senderProfile?.username ?? 'message'}</p>
            <p className="text-xs text-[#6b84ab] truncate">{replyMessage.content}</p>
          </div>
          <button onClick={() => setReplyId(null)} className="text-[#9ab0cc] hover:text-[#6b84ab] ml-2 flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Command palette */}
      {showCommands && (
        <div className="mb-2 bg-white border border-[#dce7f8] rounded-xl overflow-hidden shadow-lg shadow-[#dce7f8]/60">
          <div className="px-3 py-2 border-b border-[#dce7f8]">
            <span className="text-xs text-[#9ab0cc] font-medium">COMMANDS</span>
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
              className="w-full flex items-baseline gap-3 px-3 py-2 hover:bg-[#f3f7ff] transition-colors text-left"
              onClick={() => {
                setText(`/${cmd.name} `)
                setShowCommands(false)
                textareaRef.current?.focus()
              }}
            >
              <span className="text-sm text-[#5b8def] font-mono font-medium">/{cmd.name}</span>
              <span className="text-xs text-[#6b84ab]">{cmd.desc}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={onAttachment}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-[#5b8def] hover:bg-[#edf3ff] transition-colors"
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
          className="flex-1 resize-none bg-[#f3f7ff] rounded-2xl px-4 py-2.5 text-sm text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40 transition max-h-40 leading-relaxed disabled:opacity-50"
        />

        <button
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-[#5b8def] hover:bg-[#edf3ff] transition-colors"
        >
          <Smile size={18} />
        </button>

        <button
          onClick={submit}
          disabled={!text.trim() || disabled}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-[#5b8def] hover:bg-[#4a7de4] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
