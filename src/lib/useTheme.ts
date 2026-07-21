import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'yaply-theme'

function resolveInitialTheme(): boolean {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light') return true
  if (saved === 'dark') return false
  return window.matchMedia('(prefers-color-scheme: light)').matches
}

/** Same 'yaply-theme' localStorage key as the landing/auth pages, so the
 * choice carries over between the marketing site and the app. */
export function useTheme() {
  const [light, setLight] = useState(false)

  useEffect(() => {
    setLight(resolveInitialTheme())
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('light', light)
  }, [light])

  const toggleTheme = useCallback(() => {
    setLight((v) => {
      const next = !v
      localStorage.setItem(STORAGE_KEY, next ? 'light' : 'dark')
      return next
    })
  }, [])

  return { light, toggleTheme }
}
