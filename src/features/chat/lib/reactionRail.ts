// Personalized quick-reaction rail — mirrors iOS's CustomReactionStore
// (device-local, UserDefaults key `yaply.customReactions.v1`). Same key name
// here, in localStorage, though the two stores don't sync with each other.
const STORAGE_KEY = 'yaply.customReactions.v1'
const RAIL_SIZE = 6

const DEFAULT_RAIL = ['👍', '❤️', '😂', '😮', '😢', '🎉']

export function getReactionRail(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_RAIL
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((e) => typeof e === 'string') && parsed.length > 0) {
      return parsed.slice(0, RAIL_SIZE)
    }
    return DEFAULT_RAIL
  } catch {
    return DEFAULT_RAIL
  }
}

// Called when a user picks an emoji from the full picker (not a quick-tap on
// an existing rail slot). Moves it to the last slot, evicting the oldest
// entry if the rail is already full.
export function promoteReaction(emoji: string): string[] {
  const current = getReactionRail()
  const next = [...current.filter((e) => e !== emoji), emoji]
  const trimmed = next.length > RAIL_SIZE ? next.slice(next.length - RAIL_SIZE) : next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Private browsing / storage disabled — the rail just won't persist.
  }
  return trimmed
}
