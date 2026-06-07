import { atom } from 'jotai'

export const activeConversationIdAtom = atom<string | null>(null)
export const replyToMessageIdAtom = atom<string | null>(null)
export const conversationPanelOpenAtom = atom<boolean>(false)
// When set, ConversationPanel switches to this tab then clears it.
export const conversationPanelTabAtom = atom<string | null>(null)

// Local-only feedback shown only to the user who typed a command. Never written to DB.
export const commandFeedbackAtom = atom<string | null>(null)
