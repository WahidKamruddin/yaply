// ─── Money ────────────────────────────────────────────────────────────────────
// Budgets store numeric(12,2). Client math is done in integer cents so a form
// never shows "0.1 + 0.2" drift; the server decides how an amount is split
// (see save_expense / budget_equal_shares), clients only display and validate.

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD'] as const
export type Currency = (typeof SUPPORTED_CURRENCIES)[number]

export const EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'entertainment',
  'utilities',
  'rent',
  'health',
  'shopping',
  'other',
] as const

// Mirrors the server's `amount < 10_000_000_000` bound on numeric(12,2).
const MAX_CENTS = 999_999_999_999

/**
 * Parses user input ("12", "12.5", "12.50", "1,234.56") into a positive whole
 * number of cents. Returns null for anything else, including more than two
 * decimal places — rejecting beats silently rounding someone's money.
 */
export function parseAmountToCents(input: string): number | null {
  const s = input.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return null
  const [whole = '0', frac = ''] = s.split('.')
  const cents = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0') || '0')
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) return null
  return cents
}

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function centsToAmount(cents: number): number {
  return cents / 100
}

const formatters = new Map<string, Intl.NumberFormat>()

export function formatMoney(amount: number, currency: string): string {
  const code = currency.trim().toUpperCase() || 'USD'
  let f = formatters.get(code)
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, { style: 'currency', currency: code })
    } catch {
      f = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    formatters.set(code, f)
  }
  return f.format(amount)
}

/**
 * Preview of an equal split, matching the server rule exactly: floor(total / n)
 * cents each, leftover cents +1 each to participants in ascending id order.
 * Display only — the server recomputes and stores the real shares.
 */
export function previewEqualSplit(totalCents: number, userIds: string[]): Map<string, number> {
  const ids = [...new Set(userIds)].sort(compareUuid)
  const out = new Map<string, number>()
  if (!ids.length) return out
  const base = Math.floor(totalCents / ids.length)
  const rem = totalCents % ids.length
  ids.forEach((id, i) => out.set(id, base + (i < rem ? 1 : 0)))
  return out
}

// Postgres orders uuid by its bytes, which for canonical lowercase hex is plain
// string order. Not localeCompare: that is locale-dependent.
function compareUuid(a: string, b: string): number {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  return x < y ? -1 : x > y ? 1 : 0
}
