import { useState, useRef, useCallback, useEffect, useMemo, type KeyboardEvent } from 'react'
import { Plus, FileText, Camera, Mic, Image as ImageIcon, Smile, Send, X, Terminal } from 'lucide-react'
import { useAtom } from 'jotai'
import { replyToMessageIdAtom, commandFeedbackAtom } from '@/features/chat/store/chat.atoms'
import type { DecryptedMessage } from '@/features/chat/types'
import { COMMANDS } from '@yaply/shared/constants/commands'

interface Props {
  onSend: (text: string) => void
  onTyping?: () => void
  onStopTyping?: () => void
  replyMessage?: DecryptedMessage | null
  disabled?: boolean
  placeholder?: string
  // Expanding attachment menu actions (Messenger / Instagram style). Default to
  // no-ops so lightweight hosts can omit them.
  onPickFile?: () => void
  onPickCamera?: () => void
  onPickImage?: () => void
  onStartVoice?: () => void
  // Emoji / expression button that lives inside the text field.
  onExpression?: () => void
  // Hides the attachment toggle + emoji button entirely (e.g. thread replies).
  showAttachments?: boolean
}

const noop = () => {}

const ALL_COMMANDS = [
  ...COMMANDS,
  { name: 'help' as const, description: 'Show all commands', usage: '/help', category: 'utility' as const },
]

export default function MessageInput({
  onSend,
  onTyping,
  onStopTyping,
  replyMessage,
  disabled,
  placeholder,
  onPickFile = noop,
  onPickCamera = noop,
  onPickImage = noop,
  onStartVoice = noop,
  onExpression = noop,
  showAttachments = true,
}: Props) {
  const [text, setText] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [menuExpanded, setMenuExpanded] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const collapseMenu = useCallback(() => setMenuExpanded(false), [])
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
    if (value) {
      onTyping?.()
      setMenuExpanded(false)
    } else {
      onStopTyping?.()
    }

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
    <div className="border-t border-border bg-surface px-4 pt-3" style={{ paddingBottom: `max(0.75rem, var(--safe-bottom))` }}>
      {/* Reply strip — plain text, no highlight/accent bar */}
      {replyMessage && (
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="min-w-0">
            <p className="text-xs text-primary-text font-medium">
              Replying to {replyMessage.senderProfile?.display_name ?? replyMessage.senderProfile?.username ?? 'message'}
            </p>
            <p className="text-xs text-text-muted truncate">{replyMessage.content}</p>
          </div>
          <button onClick={() => setReplyId(null)} className="text-text-subtle hover:text-text-muted ml-2 flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Command feedback — visible only to you, never sent */}
      {feedback && (
        <div className="flex items-start justify-between mb-2 px-3 py-2 bg-tint rounded-lg border border-border">
          <div className="flex items-start gap-2 min-w-0">
            <Terminal size={13} className="text-text-subtle mt-0.5 flex-shrink-0" />
            <p className="text-xs text-text-muted whitespace-pre-wrap">{feedback}</p>
          </div>
          <button onClick={() => setFeedback(null)} className="text-text-faint hover:text-text-subtle ml-2 flex-shrink-0">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Command palette */}
      {showPalette && (
        <div className="mb-2 bg-card border border-border rounded-xl overflow-hidden shadow-lg shadow-black/40">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs text-text-subtle font-medium">COMMANDS</span>
          </div>
          {filteredCommands.map((cmd, idx) => {
            const argTokens = cmd.usage.split(' ').slice(1)
            const isTypingArgs = text.split(' ').length > 1
            return (
              <button
                key={cmd.name}
                className={`w-full flex items-center px-3 py-2.5 transition-colors text-left border-l-2 ${
                  idx === selectedIndex
                    ? 'bg-primary-tint border-[#5b8def]'
                    : 'border-transparent hover:bg-tint'
                }`}
                onClick={() => selectCommand(cmd.name)}
              >
                <span className="text-sm text-[#5b8def] font-mono font-medium flex-shrink-0">/{cmd.name}</span>
                {argTokens.map((token, i) => (
                  <span
                    key={i}
                    className={`text-sm font-mono ml-1 flex-shrink-0 transition-all rounded px-0.5 ${
                      isTypingArgs && i === activeArgIndex
                        ? 'text-text-subtle'
                        : 'text-text-subtle opacity-40'
                    }`}
                  >
                    {token}
                  </span>
                ))}
                <span className="text-xs text-text-subtle ml-3 truncate">{cmd.description}</span>
              </button>
            )
          })}
          {filteredCommands.length > 1 && (
            <div className="px-3 py-1.5 border-t border-border-soft">
              <span className="text-[10px] text-text-faint">Tab to cycle · Enter to select · Esc to close</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        {showAttachments && (
          <button
            onClick={() => setMenuExpanded((v) => !v)}
            disabled={disabled}
            aria-label={menuExpanded ? 'Collapse attachments' : 'Attachments'}
            className="flex-shrink-0 self-center w-9 h-9 flex items-center justify-center rounded-full text-text-subtle hover:text-primary-text hover:bg-primary-tint transition-colors disabled:opacity-50"
          >
            <Plus
              size={20}
              className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${menuExpanded ? 'rotate-45' : ''}`}
            />
          </button>
        )}

        {showAttachments && (
          <div
            className={`flex items-center self-center gap-1 flex-shrink-0 overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none ${
              menuExpanded ? 'max-w-[180px] opacity-100' : 'max-w-0 opacity-0'
            }`}
            aria-hidden={!menuExpanded}
          >
            {[
              { key: 'file', Icon: FileText, label: 'File', run: onPickFile },
              { key: 'camera', Icon: Camera, label: 'Camera', run: onPickCamera },
              { key: 'voice', Icon: Mic, label: 'Voice message', run: onStartVoice },
              { key: 'image', Icon: ImageIcon, label: 'Image', run: onPickImage },
            ].map(({ key, Icon, label, run }) => (
              <button
                key={key}
                onClick={() => { run(); collapseMenu() }}
                disabled={disabled}
                tabIndex={menuExpanded ? 0 : -1}
                aria-label={label}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-tint text-primary-text hover:bg-primary-tint transition-colors disabled:opacity-50"
              >
                <Icon size={17} />
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={collapseMenu}
            placeholder={placeholder ?? 'Message...'}
            disabled={disabled}
            rows={1}
            className={`w-full resize-none bg-tint border border-border rounded-2xl py-2.5 pl-4 text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/50 focus:border-[#5b8def]/50 transition max-h-40 leading-relaxed disabled:opacity-50 ${showAttachments ? 'pr-11' : 'pr-4'}`}
          />
          {showAttachments && (
            <button
              onClick={onExpression}
              disabled={disabled}
              aria-label="GIFs, stickers and more"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-text-subtle hover:text-primary-text hover:bg-primary-tint transition-colors disabled:opacity-50"
            >
              <Smile size={18} />
            </button>
          )}
        </div>

        <button
          onClick={submit}
          disabled={!text.trim() || disabled}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark hover:brightness-110 text-white shadow-[0_6px_18px_rgba(91,141,239,0.35)] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
