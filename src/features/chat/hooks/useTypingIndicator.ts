import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

const TYPING_TIMEOUT_MS = 3000

export function useTypingIndicator(
  conversationId: string | null,
  currentUserId: string,
  currentUsername: string,
) {
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const timeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)

  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const { userId, username, isTyping } = payload as {
          userId: string
          username: string
          isTyping: boolean
        }
        if (userId === currentUserId) return

        if (timeouts.current[userId]) {
          clearTimeout(timeouts.current[userId])
          delete timeouts.current[userId]
        }

        if (isTyping) {
          setTypingUsers((prev) => (prev.includes(username) ? prev : [...prev, username]))
          timeouts.current[userId] = setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u !== username))
            delete timeouts.current[userId]
          }, TYPING_TIMEOUT_MS)
        } else {
          setTypingUsers((prev) => prev.filter((u) => u !== username))
        }
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      void supabase.removeChannel(channel)
      channelRef.current = null
      Object.values(timeouts.current).forEach(clearTimeout)
      timeouts.current = {}
      setTypingUsers([])
      if (debounceRef.current) clearTimeout(debounceRef.current)
      isTypingRef.current = false
    }
  }, [conversationId, currentUserId])

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!channelRef.current) return
      void channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUserId, username: currentUsername, isTyping },
      })
    },
    [currentUserId, currentUsername],
  )

  // Call this on every keystroke — debounces the stop event automatically
  const notifyTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true
      sendTyping(true)
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      isTypingRef.current = false
      sendTyping(false)
    }, TYPING_TIMEOUT_MS)
  }, [sendTyping])

  // Call this when the message is sent
  const notifyStopTyping = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (isTypingRef.current) {
      isTypingRef.current = false
      sendTyping(false)
    }
  }, [sendTyping])

  return { typingUsers, notifyTyping, notifyStopTyping }
}
