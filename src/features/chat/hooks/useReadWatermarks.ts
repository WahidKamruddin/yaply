import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchMemberWatermarks } from '../api/conversations'
import type { MemberWatermark } from '../lib/readReceipts'

/**
 * Every member's read/delivery watermark for the open conversation, kept live.
 *
 * Watermarks change as `conversation_members` UPDATEs, which — unlike the old
 * per-message `message_reads` inserts — can be filtered to this conversation,
 * so the channel only ever hears its own members.
 */
export function useReadWatermarks(conversationId: string | null): MemberWatermark[] {
  const [watermarks, setWatermarks] = useState<MemberWatermark[]>([])

  useEffect(() => {
    setWatermarks([])
    if (!conversationId) return
    let cancelled = false

    const load = () =>
      fetchMemberWatermarks(conversationId)
        .then((rows) => { if (!cancelled) setWatermarks(rows) })
        .catch((err: unknown) => { console.error('[yaply] failed to load read watermarks', err) })

    const channel = supabase
      .channel(`read-watermarks:${conversationId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_at: string | null; last_delivered_at: string | null }
          setWatermarks((prev) => {
            const next = { userId: row.user_id, readAt: row.last_read_at, deliveredAt: row.last_delivered_at }
            return prev.some((w) => w.userId === row.user_id)
              ? prev.map((w) => (w.userId === row.user_id ? next : w))
              : [...prev, next]
          })
        },
      )
      // Load after joining so an update landing in between isn't lost.
      .subscribe((status) => { if (status === 'SUBSCRIBED') void load() })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [conversationId])

  return watermarks
}
