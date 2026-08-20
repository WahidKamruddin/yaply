// Human-readable name for the install registering itself in the `devices`
// table. Written once, at first registration only — a later login must never
// overwrite it, or a device the user renamed would silently revert.

export type DevicePlatform = 'web' | 'ios' | 'android'

function browserName(ua: string): string {
  // Order matters: Edge and Opera both carry "Chrome" in their UA, and every
  // Chromium browser carries "Safari".
  if (/\bEdgA?\//.test(ua)) return 'Edge'
  if (/\bOPR\//.test(ua) || /\bOpera\//.test(ua)) return 'Opera'
  if (/\bFirefox\//.test(ua) || /\bFxiOS\//.test(ua)) return 'Firefox'
  if (/\bSamsungBrowser\//.test(ua)) return 'Samsung Internet'
  if (/\bCriOS\//.test(ua) || /\bChrome\//.test(ua)) return 'Chrome'
  if (/\bSafari\//.test(ua)) return 'Safari'
  return 'Browser'
}

function osName(ua: string): string {
  if (/\bAndroid\b/.test(ua)) return 'Android'
  if (/\b(iPhone|iPod)\b/.test(ua)) return 'iPhone'
  if (/\biPad\b/.test(ua)) return 'iPad'
  if (/\bCrOS\b/.test(ua)) return 'ChromeOS'
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return 'macOS'
  if (/\bWindows\b/.test(ua)) return 'Windows'
  if (/\bLinux\b/.test(ua)) return 'Linux'
  return 'Unknown device'
}

// e.g. "Chrome on macOS (Web)". The platform suffix is part of the generated
// name on purpose: it tells the user at a glance which entry is the website
// and which is the phone app, without every client having to know how to
// render a separate platform field.
export function generateDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Web (Web)'
  const ua = navigator.userAgent
  return `${browserName(ua)} on ${osName(ua)} (Web)`
}

export const DEVICE_PLATFORM: DevicePlatform = 'web'
