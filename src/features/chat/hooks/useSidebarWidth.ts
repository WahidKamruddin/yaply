import { useCallback, useEffect, useState } from 'react'

// NOT CURRENTLY WIRED UP. Hooking this into src/routes/chat.tsx broke the
// desktop layout — the sidebar wrapper kept `w-full` at the md breakpoint
// with no width override, which collapsed the chat pane to zero width.
// Kept here, unused, for a future retry once the wrapper's width classes
// are sorted out.

const STORAGE_KEY = 'yaply-sidebar-width'
export const DEFAULT_SIDEBAR_WIDTH = 288

function clamp(width: number) {
  const max = Math.max(DEFAULT_SIDEBAR_WIDTH, window.innerWidth * 0.2)
  return Math.min(Math.max(width, DEFAULT_SIDEBAR_WIDTH), max)
}

export function useSidebarWidth() {
  const [width, setWidth] = useState(DEFAULT_SIDEBAR_WIDTH)

  useEffect(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY))
    if (saved) setWidth(clamp(saved))
  }, [])

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width

    function onMove(ev: PointerEvent) {
      setWidth(clamp(startWidth + (ev.clientX - startX)))
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setWidth((w) => {
        localStorage.setItem(STORAGE_KEY, String(w))
        return w
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [width])

  return { width, startResize }
}
