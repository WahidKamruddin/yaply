// Full emoji picker opened from the reaction rail's "+" button. A flat,
// curated grid rather than a live Unicode database — good enough for
// reactions, which skew toward a small recurring set anyway.
const EMOJI_GRID = [
  '👍', '👎', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '😀', '😁', '😂', '🤣', '😊', '😍', '🥰', '😘', '😜', '🤪',
  '😎', '🤔', '😐', '😑', '😴', '🥱', '😢', '😭', '😡', '🤬',
  '😱', '😨', '🥺', '😇', '🤗', '🤫', '🤐', '🙄', '😬', '🤯',
  '👏', '🙌', '🙏', '💪', '👊', '✌️', '🤞', '👌', '🤙', '👋',
  '🔥', '💯', '✨', '🎉', '🎊', '🥳', '😮', '😲', '🤩', '🥹',
  '💀', '👻', '🤡', '🤖', '👽', '🐶', '🐱', '🐼', '🦄', '🐸',
  '🍕', '🍔', '🍟', '🌮', '🍰', '☕', '🍺', '🥂', '🍾', '🎂',
  '⚽', '🏀', '🎮', '🎵', '📸', '💡', '⭐', '🌈', '☀️', '🌙',
]

interface Props {
  onSelect: (emoji: string) => void
}

export default function EmojiPickerPopover({ onSelect }: Props) {
  return (
    <div className="grid grid-cols-8 gap-0.5 w-64 max-h-56 overflow-y-auto p-1">
      {EMOJI_GRID.map((emoji, i) => (
        <button
          key={`${emoji}-${i}`}
          onClick={() => onSelect(emoji)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-lg hover:bg-tint-strong hover:scale-110 transition-all"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
