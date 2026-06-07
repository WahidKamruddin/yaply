export type CommandCategory = 'utility' | 'productivity' | 'social'

export type CommandName =
  | 'help'
  | 'remind'
  | 'mute'
  | 'plan'
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
  example?: string
  category: CommandCategory
}

export const COMMANDS: CommandDefinition[] = [
  { name: 'remind',  description: 'Set a personal reminder',  usage: '/remind [date] [time] [message]', example: '/remind 06/15/2026 3:00pm Call Alice', category: 'utility' },
  { name: 'mute',    description: 'Mute this conversation',    usage: '/mute [duration]',         example: '/mute 2h',                    category: 'utility' },
  { name: 'task',    description: 'Create a task',             usage: '/task [title]',            example: '/task Fix login bug',          category: 'productivity' },
  { name: 'note',    description: 'Save a note',               usage: '/note [title]',            example: '/note Meeting recap',          category: 'productivity' },
  { name: 'album',   description: 'Create a photo album',      usage: '/album [name]',            example: '/album Trip photos',           category: 'productivity' },
  { name: 'budget',  description: 'Create a shared budget',    usage: '/budget [name]',           example: '/budget Road trip',            category: 'productivity' },
  { name: 'plan',    description: 'Poll group availability',    usage: '/plan [title]',            example: '/plan Weekend hike',           category: 'social' },
  { name: 'poll',    description: 'Create a poll',             usage: '/poll [question]',         example: '/poll Pizza or tacos?',        category: 'social' },
  { name: 'event',   description: 'Schedule an event',         usage: '/event [title]',           example: '/event Team lunch Friday',     category: 'social' },
]
