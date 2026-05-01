export type CommandCategory = 'utility' | 'productivity' | 'social'

export type CommandName =
  | 'help'
  | 'remind'
  | 'mute'
  | 'thread'
  | 'plan'
  | 'create'
  | 'poll'
  | 'event'
  | 'task'
  | 'note'
  | 'album'
  | 'budget'

export interface CommandDefinition {
  name: CommandName
  description: string
  usage: string
  category: CommandCategory
}

export const COMMANDS: CommandDefinition[] = [
  { name: 'help', description: 'Show all available commands', usage: '/help', category: 'utility' },
  { name: 'remind', description: 'Set a reminder', usage: '/remind [me|all|@user] [time] [message]', category: 'utility' },
  { name: 'mute', description: 'Mute this conversation', usage: '/mute [30m|2h|1d|1w|forever]', category: 'utility' },
  { name: 'thread', description: 'Start a named thread', usage: '/thread [name]', category: 'utility' },
  { name: 'plan', description: 'Create a shared plan or event', usage: '/plan [title]', category: 'productivity' },
  { name: 'create', description: 'Create a task, poll, event, note, album, or budget', usage: '/create [task|poll|event|note|album|budget] [title]', category: 'productivity' },
  { name: 'poll', description: 'Create a poll', usage: '/poll [question]', category: 'social' },
  { name: 'event', description: 'Schedule an event', usage: '/event [title]', category: 'productivity' },
  { name: 'task', description: 'Create a task', usage: '/task [title]', category: 'productivity' },
  { name: 'note', description: 'Create a shared note', usage: '/note [title]', category: 'productivity' },
  { name: 'album', description: 'Create a photo album', usage: '/album [title]', category: 'social' },
  { name: 'budget', description: 'Create a shared budget', usage: '/budget [title] [amount]', category: 'productivity' },
]
