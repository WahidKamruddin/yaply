/**
 * "Best slot" for a planning event — the cell the landing page's demo makes
 * glow. Mirrored on iOS (`BestSlot.swift`); both must apply the same rule:
 *
 * - counts are *live*: everyone else's saved availability plus the current
 *   user's local (possibly unsaved) selection, so the heatmap reacts before Save
 * - highest count wins across every week, not just the one on screen
 * - ties go to the earliest slot (slot keys are same-format UTC ISO strings,
 *   so string order is chronological)
 * - nothing is "best" below two people — one person isn't a consensus
 */

export const BEST_SLOT_MIN_COUNT = 2

export interface SlotAvailability {
  user_id: string
  slots: string[]
}

export function buildLiveCounts(
  availability: SlotAvailability[],
  currentUserId: string,
  mySlots: Iterable<string>,
): Map<string, number> {
  const counts = new Map<string, number>()
  const bump = (slot: string) => counts.set(slot, (counts.get(slot) ?? 0) + 1)
  for (const av of availability) {
    if (av.user_id === currentUserId) continue
    for (const slot of av.slots) bump(slot)
  }
  for (const slot of mySlots) bump(slot)
  return counts
}

export function findBestSlot(
  counts: Map<string, number>,
  minCount = BEST_SLOT_MIN_COUNT,
): { slot: string; count: number } | null {
  let best: { slot: string; count: number } | null = null
  for (const [slot, count] of counts) {
    if (count < minCount) continue
    if (!best || count > best.count || (count === best.count && slot < best.slot)) {
      best = { slot, count }
    }
  }
  return best
}

/** Heat level 0–3 by share of members free, matching the landing's `.lp-lvN`. */
export function heatLevel(count: number, totalMembers: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0
  const ratio = count / Math.max(1, totalMembers)
  if (ratio <= 1 / 3) return 1
  if (ratio <= 2 / 3) return 2
  return 3
}
