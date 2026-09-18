// "Item created" system messages. The decoded text of a `type='system'`
// message is JSON `{"v":1,"kind":…,"id":…,"title":…}` so the pill can open
// the exact item. Mirrors iOS `SystemItemMessage.swift` — the format must
// match byte-for-byte. Anything that doesn't parse is a legacy plain-text
// system message (they expire after 7 days).

export type ItemKind = 'task' | 'note' | 'album' | 'budget' | 'plan' | 'event' | 'reminder'

export interface SystemItem {
  kind: ItemKind
  id: string
  title: string
}

export type PanelTab = 'reminders' | 'events' | 'albums' | 'tasks' | 'notes' | 'budgets'

export const ITEM_META: Record<ItemKind, { noun: string; tab: PanelTab }> = {
  task:     { noun: 'task',     tab: 'tasks' },
  note:     { noun: 'note',     tab: 'notes' },
  album:    { noun: 'album',    tab: 'albums' },
  budget:   { noun: 'budget',   tab: 'budgets' },
  plan:     { noun: 'plan',     tab: 'events' },
  event:    { noun: 'event',    tab: 'events' },
  reminder: { noun: 'reminder', tab: 'reminders' },
}

const KINDS = Object.keys(ITEM_META) as ItemKind[]

/** Tasks and reminders have no detail view — they open the panel tab. */
export function opensInPanelOnly(kind: ItemKind): boolean {
  return kind === 'task' || kind === 'reminder'
}

export function encodeSystemItem(item: SystemItem): string {
  return JSON.stringify({ v: 1, kind: item.kind, id: item.id, title: item.title })
}

export function parseSystemItem(text: string): SystemItem | null {
  if (!text.startsWith('{')) return null
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    if (raw.v !== 1) return null
    if (typeof raw.kind !== 'string' || !KINDS.includes(raw.kind as ItemKind)) return null
    if (typeof raw.id !== 'string' || !raw.id) return null
    return { kind: raw.kind as ItemKind, id: raw.id, title: typeof raw.title === 'string' ? raw.title : '' }
  } catch {
    return null
  }
}

/** One-line text for places that can't render the pill (sidebar preview). */
export function systemItemPreview(text: string): string {
  const item = parseSystemItem(text)
  return item ? `Created a ${ITEM_META[item.kind].noun}: ${item.title}` : text
}
