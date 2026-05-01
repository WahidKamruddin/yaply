import { COMMANDS } from '@yaply/shared/constants/commands'

export function helpHandler(): string {
  const lines = ['**Available Commands:**', '']
  for (const cmd of COMMANDS) {
    lines.push(`• \`${cmd.usage}\` — ${cmd.description}`)
  }
  return lines.join('\n')
}
