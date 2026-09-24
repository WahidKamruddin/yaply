import { describe, it, expect } from 'vitest'
import { parseAmountToCents, previewEqualSplit, toCents } from './money'

describe('parseAmountToCents', () => {
  it('parses whole and decimal amounts', () => {
    expect(parseAmountToCents('12')).toBe(1200)
    expect(parseAmountToCents('12.5')).toBe(1250)
    expect(parseAmountToCents('12.05')).toBe(1205)
    expect(parseAmountToCents('.5')).toBe(50)
    expect(parseAmountToCents(' 1,234.56 ')).toBe(123456)
  })

  it('rejects zero, negatives, junk and extra precision', () => {
    for (const bad of ['', '0', '0.00', '-5', 'abc', '1.234', '1e3', '12.', '1.2.3']) {
      expect(parseAmountToCents(bad)).toBeNull()
    }
  })

  it('rejects amounts past numeric(12,2)', () => {
    expect(parseAmountToCents('9999999999.99')).toBe(999_999_999_999)
    expect(parseAmountToCents('10000000000')).toBeNull()
  })
})

describe('toCents', () => {
  it('survives float noise', () => {
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(33.33)).toBe(3333)
  })
})

describe('previewEqualSplit', () => {
  const a = '00000000-0000-0000-0000-00000000000a'
  const b = '00000000-0000-0000-0000-00000000000b'
  const c = '00000000-0000-0000-0000-00000000000c'

  it('gives leftover cents to the lowest ids first (matches budget_equal_shares)', () => {
    const s = previewEqualSplit(10000, [c, a, b])
    expect(s.get(a)).toBe(3334)
    expect(s.get(b)).toBe(3333)
    expect(s.get(c)).toBe(3333)
  })

  it('always sums to the total', () => {
    const s = previewEqualSplit(1001, [a, b, c])
    expect([...s.values()].reduce((x, y) => x + y, 0)).toBe(1001)
  })

  it('de-duplicates and handles no one', () => {
    expect(previewEqualSplit(100, [a, a]).get(a)).toBe(100)
    expect(previewEqualSplit(100, []).size).toBe(0)
  })
})
