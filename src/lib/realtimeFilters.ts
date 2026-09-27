/** Supabase Realtime's cap on an `in.(…)` filter; past it we go unfiltered rather than miss events. */
export const MAX_FILTER_VALUES = 100

/**
 * A postgres_changes `in.(…)` filter over `ids`, or undefined (unfiltered) past
 * the server's cap. Unfiltered subscriptions make Realtime authorise every
 * write in the table for every subscriber, which delays everyone's events.
 */
export function inFilter(column: string, ids: string[]): string | undefined {
  return ids.length <= MAX_FILTER_VALUES ? `${column}=in.(${ids.join(',')})` : undefined
}
