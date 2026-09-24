import { describe, expect, it } from 'vitest'
import { buildLiveCounts, findBestSlot, heatLevel } from './bestSlot'

const A = '2026-10-02T23:00:00.000Z'
const B = '2026-10-03T00:00:00.000Z'
const C = '2026-10-10T18:00:00.000Z'

describe('bestSlot', () => {
  it('replaces the current user saved row with their local selection', () => {
    const counts = buildLiveCounts(
      [
        { user_id: 'me', slots: [A] },
        { user_id: 'x', slots: [A, B] },
      ],
      'me',
      [B],
    )
    expect(counts.get(A)).toBe(1)
    expect(counts.get(B)).toBe(2)
  })

  it('picks the highest count, ties going to the earliest slot', () => {
    const counts = new Map([
      [B, 3],
      [A, 3],
      [C, 2],
    ])
    expect(findBestSlot(counts)).toEqual({ slot: A, count: 3 })
  })

  it('finds a best slot outside the visible week', () => {
    const counts = new Map([
      [A, 2],
      [C, 4],
    ])
    expect(findBestSlot(counts)?.slot).toBe(C)
  })

  it('needs at least two people', () => {
    expect(findBestSlot(new Map([[A, 1]]))).toBeNull()
    expect(findBestSlot(new Map())).toBeNull()
  })

  it('maps counts to four heat levels', () => {
    expect(heatLevel(0, 6)).toBe(0)
    expect(heatLevel(2, 6)).toBe(1)
    expect(heatLevel(4, 6)).toBe(2)
    expect(heatLevel(5, 6)).toBe(3)
    expect(heatLevel(1, 0)).toBe(3)
  })
})
