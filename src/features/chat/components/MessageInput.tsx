import { useState, useRef, useCallback, useEffect, useMemo, type KeyboardEvent } from 'react'
import { Paperclip, Smile, Send, X, Terminal } from 'lucide-react'
import { useAtom } from 'jotai'
import { replyToMessageIdAtom, commandFeedbackAtom } from '@/features/chat/store/chat.atoms'
import type { DecryptedMessage } from '@/features/chat/types'
import { COMMANDS } from '@yaply/shared/constants/commands'

interface Props {
  onSend: (text: string) => void
  onAttachment?: () => void
  onTyping?: () => void
  onStopTyping?: () => void
  replyMessage?: DecryptedMessage | null
  disabled?: boolean
}

const ALL_COMMANDS = [
  ...COMMANDS,
  { name: 'help' as const, description: 'Show all commands', usage: '/help', category: 'utility' as const },
]

export default function MessageInput({ onSend, onAttachment, onTyping, onStopTyping, replyMessage, disabled }: Props) {
  const [text, setText] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [, setReplyId] = useAtom(replyToMessageIdAtom)
  const [feedback, setFeedback] = useAtom(commandFeedbackAtom)

  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), 6_000)
    return () => clearTimeout(t)
  }, [feedback, setFeedback])

  // Filtered command list — stays open while typing args for a matched command
  const filteredCommands = useMemo(() => {
    if (!text.startsWith('/')) return []
    const parts = text.split(' ')
    const partial = parts[0].slice(1).toLowerCase()
    if (parts.length === 1) {
      if (!partial) return ALL_COMMANDS
      return ALL_COMMANDS.filter((c) => c.name.startsWith(partial))
    }
    // Typing args: keep palette open for the exact matched command only
    const cmd = ALL_COMMANDS.find((c) => c.name === partial)
    return cmd ? [cmd] : []
  }, [text])

  // Which arg token is currently being typed (0-indexed into argTokens array)
  const activeArgIndex = useMemo(() => {
    if (!text.startsWith('/')) return -1
    const parts = text.split(' ')
    if (parts.length <= 1) return -1
    const cmdName = parts[0].slice(1).toLowerCase()
    const cmd = ALL_COMMANDS.find((c) => c.name === cmdName)
    if (!cmd) return -1
    const argTokens = cmd.usage.split(' ').slice(1)
    if (!argTokens.length) return -1
    return Math.min(parts.slice(1).length - 1, argTokens.length - 1)
  }, [text])

  const showPalette = filteredCommands.length > 0

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex(-1)
  }, [filteredCommands.length])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setText(value)
    if (value) onTyping?.()
    else onStopTyping?.()

    // Auto-resize
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    }
  }, [onTyping, onStopTyping])

  function selectCommand(name: string) {
    const newText = `/${name} `
    setText(newText)
    setSelectedIndex(-1)
    textareaRef.current?.focus()
  }

  function submit() {
    // If palette open and an item selected, complete it
    if (showPalette && selectedIndex >= 0 && filteredCommands[selectedIndex]) {
      selectCommand(filteredCommands[selectedIndex].name)
      return
    }

    const trimmed = text.trim()
    if (!trimmed || disabled) return

    if (trimmed.startsWith('/')) {
      const [rawName, ...args] = trimmed.slice(1).split(' ')
      const name = rawName?.toLowerCase() ?? ''
      window.dispatchEvent(
        new CustomEvent('yaply:command', { detail: { name, args, rawArgs: args.join(' ') } }),
      )
      setText('')
      return
    }

    onSend(trimmed)
    onStopTyping?.()
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (showPalette) {
        if (e.key === 'Tab' || e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex((i) => (i + 1) % filteredCommands.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setText('')
          setSelectedIndex(-1)
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          const isTypingArgs = text.includes(' ')
          if (isTypingArgs) {
            // User has already typed args — submit the command, don't complete
            submit()
          } else if (selectedIndex >= 0 && filteredCommands[selectedIndex]) {
            selectCommand(filteredCommands[selectedIndex].name)
          } else if (filteredCommands.length === 1) {
            selectCommand(filteredCommands[0].name)
          }
          return
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submit()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, showPalette, selectedIndex, filteredCommands],
  )

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

      {/* Command feedback — visible only to you, never sent */}
      {feedback && (
        <div className="flex items-start justify-between mb-2 px-3 py-2 bg-[#f3f7ff] rounded-lg border border-[#dce7f8]">
          <div className="flex items-start gap-2 min-w-0">
            <Terminal size={13} className="text-[#9ab0cc] mt-0.5 flex-shrink-0" />
            <p className="text-xs text-[#6b84ab] whitespace-pre-wrap">{feedback}</p>
          </div>
          <button onClick={() => setFeedback(null)} className="text-[#c5d5e8] hover:text-[#9ab0cc] ml-2 flex-shrink-0">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Command palette */}
      {showPalette && (
        <div className="mb-2 bg-white border border-[#dce7f8] rounded-xl overflow-hidden shadow-lg shadow-[#dce7f8]/60">
          <div className="px-3 py-2 border-b border-[#dce7f8]">
            <span className="text-xs text-[#9ab0cc] font-medium">COMMANDS</span>
          </div>
          {filteredCommands.map((cmd, idx) => {
            const argTokens = cmd.usage.split(' ').slice(1)
            const isTypingArgs = text.split(' ').length > 1
            return (
              <button
                key={cmd.name}
                className={`w-full flex items-center px-3 py-2.5 transition-colors text-left border-l-2 ${
                  idx === selectedIndex
                    ? 'bg-[#edf3ff] border-[#5b8def]'
                    : 'border-transparent hover:bg-[#f3f7ff]'
                }`}
                onClick={() => selectCommand(cmd.name)}
              >
                <span className="text-sm text-[#5b8def] font-mono font-medium flex-shrink-0">/{cmd.name}</span>
                {argTokens.map((token, i) => (
                  <span
                    key={i}
                    className={`text-sm font-mono ml-1 flex-shrink-0 transition-all rounded px-0.5 ${
                      isTypingArgs && i === activeArgIndex
                        ? 'text-[#9ab0cc]'
                        : 'text-[#9ab0cc] opacity-40'
                    }`}
                  >
                    {token}
                  </span>
                ))}
                <span className="text-xs text-[#9ab0cc] ml-3 truncate">{cmd.description}</span>
              </button>
            )
          })}
          {filteredCommands.length > 1 && (
            <div className="px-3 py-1.5 border-t border-[#f0f4fc]">
              <span className="text-[10px] text-[#c5d5e8]">Tab to cycle · Enter to select · Esc to close</span>
            </div>
          )}
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
