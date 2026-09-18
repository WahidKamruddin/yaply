import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { ItemKind, PanelTab } from '../lib/systemItem'

export interface PanelTarget {
  tab: PanelTab
  itemId?: string
}

export const activeConversationIdAtom = atom<string | null>(null)

// Desktop-only: collapses the left conversation-list column. Persisted so the
// choice survives reloads. Ignored on mobile (the list is a full-screen view).
export const sidebarCollapsedAtom = atomWithStorage<boolean>('yaply-sidebar-collapsed', false)
export const replyToMessageIdAtom = atom<string | null>(null)
export const conversationPanelOpenAtom = atom<boolean>(false)
// When set, ConversationPanel switches to this tab (and, with itemId, opens
// that album/budget/note) then clears it.
export const conversationPanelTargetAtom = atom<PanelTarget | null>(null)

// A request to open one productivity item in a conversation — from an
// item-created pill or a Dashboard row. ChatView consumes it once that
// conversation is active (the Dashboard unmounts in between, so it can't be
// component state).
export const openItemRequestAtom = atom<{ conversationId: string; kind: ItemKind; id: string } | null>(null)

// Local-only feedback shown only to the user who typed a command. Never written to DB.
export const commandFeedbackAtom = atom<string | null>(null)
