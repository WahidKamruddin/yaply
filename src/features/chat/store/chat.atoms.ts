import { atom } from 'jotai'

export const activeConversationIdAtom = atom<string | null>(null)
export const replyToMessageIdAtom = atom<string | null>(null)
