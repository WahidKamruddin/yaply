export type CreateItemType = 'task' | 'poll' | 'event' | 'note' | 'album' | 'budget' | 'plan'

export function parseCreateType(arg: string | undefined): CreateItemType | null {
  const map: Record<string, CreateItemType> = {
    task: 'task',
    tasks: 'task',
    poll: 'poll',
    polls: 'poll',
    event: 'event',
    events: 'event',
    note: 'note',
    notes: 'note',
    album: 'album',
    albums: 'album',
    budget: 'budget',
    budgets: 'budget',
    plan: 'plan',
    plans: 'plan',
  }
  if (!arg) return null
  return map[arg.toLowerCase()] ?? null
}

export interface CreateArgs {
  conversationId: string
  createdBy: string
  args: string[]
  openModal: (type: CreateItemType, title?: string) => void
}

export function createHandler({ args, openModal }: CreateArgs): string {
  const [typeStr, ...titleParts] = args
  const type = parseCreateType(typeStr)
  if (!type) return `Unknown type "${typeStr}". Use: task, poll, event, note, album, budget`
  const title = titleParts.join(' ') || undefined
  openModal(type, title)
  return ''
}
