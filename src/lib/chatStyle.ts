import { useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

/** The user's selected chat visual style — yaply's own look, or a
 * Messenger/iMessage-inspired skin. UI-only: no feature or behavior differs
 * between styles. Mirrors iOS `Core/Styling/ChatStyle.swift`.
 *
 * Token-level differences (accent, background, bubble fill and radii, display
 * font, list density) live in styles.css under `html[data-chat-style=…]`;
 * components read the atom only where the markup itself changes (reactions,
 * chat header, composer send icon). */
export type ChatStyle = 'yaply' | 'messenger' | 'imessage'

export const CHAT_STYLES: { value: ChatStyle; label: string }[] = [
  { value: 'yaply', label: 'yaply' },
  { value: 'messenger', label: 'Messenger' },
  { value: 'imessage', label: 'iMessage' },
]

export const chatStyleAtom = atomWithStorage<ChatStyle>('yaply-chat-style', 'yaply')

export function useChatStyle(): ChatStyle {
  return useAtomValue(chatStyleAtom)
}

/** Mirrors the selected style onto `<html data-chat-style>` so the CSS token
 * overrides apply app-wide. Mounted once in the root document. */
export function useApplyChatStyle() {
  const style = useChatStyle()
  useEffect(() => {
    document.documentElement.dataset.chatStyle = style
  }, [style])
}
