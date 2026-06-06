import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { insertReadReceipts, fetchReadSet } from '../api/reads'
import type { DecryptedMessage } from '../types'

export function useReadReceipts(
  conversationId: string | null,
  currentUserId: string,
  messages: DecryptedMessage[],
): Set<string> {
  const [readByOtherSet, setReadByOtherSet] = useState<Set<string>>(new Set())
  const markedRef = useRef<Set<string>>(new Set())

  const reload = useCallback(async () => {
    const ownIds = messages.filter((m) => m.senderId === currentUserId).map((m) => m.id)
    if (ownIds.length === 0) { setReadByOtherSet(new Set()); return }
    const set = await fetchReadSet(ownIds, currentUserId)
    setReadByOtherSet(set)
  }, [messages, currentUserId])

  // Mark incoming messages as read (only once per message, only for current conversation)
  useEffect(() => {
    if (!conversationId) return
    const unread = messages
      .filter(
        (m) =>
          m.conversationId === conversationId &&
          m.senderId !== currentUserId &&
          !markedRef.current.has(m.id),
      )
      .map((m) => m.id)
    if (unread.length === 0) return
    unread.forEach((id) => markedRef.current.add(id))
    insertReadReceipts(unread, currentUserId).catch(() => {
      unread.forEach((id) => markedRef.current.delete(id))
    })
  }, [conversationId, messages, currentUserId])

  // Fetch read status for my messages
  useEffect(() => {
    void reload()
  }, [reload])

  // Live updates
  useEffect(() => {
    if (!conversationId) return
    const channel = supabase
      .channel(`reads:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reads' }, () => {
        void reload()
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [conversationId, reload])

  // Reset when conversation changes
  useEffect(() => {
    markedRef.current = new Set()
    setReadByOtherSet(new Set())
  }, [conversationId])

  return readByOtherSet
}
