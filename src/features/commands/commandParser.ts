export interface ParsedCommand {
  name: string
  rawArgs: string
  args: string[]
}

export function parseCommand(input: string): ParsedCommand | null {
  if (!input.startsWith('/')) return null
  const trimmed = input.slice(1).trim()
  const [rawName, ...rest] = trimmed.split(' ')
  if (!rawName) return null
  const name = rawName.toLowerCase()
  const rawArgs = rest.join(' ')
  const args = rest.filter(Boolean)
  return { name, rawArgs, args }
}

export function parseDuration(str: string): Date | null {
  if (str === 'forever') return null
  const match = str.match(/^(\d+)([mhdw])$/)
  if (!match) return null
  const [, num, unit] = match
  const n = parseInt(num!, 10)
  const now = Date.now()
  const ms = unit === 'm' ? n * 60_000
    : unit === 'h' ? n * 3_600_000
    : unit === 'd' ? n * 86_400_000
    : n * 604_800_000
  return new Date(now + ms)
}

export function parseDateTime(str: string): Date | null {
  const lower = str.toLowerCase().trim()
  const now = new Date()

  if (lower === 'tomorrow') {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return d
  }

  const tomorrowMatch = lower.match(/^tomorrow\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (tomorrowMatch) {
    const [, h, m, ampm] = tomorrowMatch
    let hour = parseInt(h!, 10)
    const min = parseInt(m ?? '0', 10)
    if (ampm === 'pm' && hour < 12) hour += 12
    if (ampm === 'am' && hour === 12) hour = 0
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    d.setHours(hour, min, 0, 0)
    return d
  }

  const timeMatch = lower.match(/^(\d{1,2}):(\d{2})$/)
  if (timeMatch) {
    const [, h, m] = timeMatch
    const d = new Date(now)
    d.setHours(parseInt(h!, 10), parseInt(m!, 10), 0, 0)
    if (d <= now) d.setDate(d.getDate() + 1)
    return d
  }

  const parsed = Date.parse(str)
  if (!isNaN(parsed)) return new Date(parsed)

  return null
}
