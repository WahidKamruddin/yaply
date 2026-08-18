import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

// The QR is a convenience wrapper around the typed code, never the only path —
// it encodes a deep link so a phone's native camera app lands straight in the
// entrant flow. The code lives in the URL *fragment* so it never reaches
// server logs, proxies, or a Referer header.
export function pairingLink(code: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return `${origin}/link#c=${code}`
}

export default function PairingQr({ code, size = 176 }: { code: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    void QRCode.toCanvas(canvas, pairingLink(code), {
      width: size,
      margin: 1,
      color: { dark: '#1a2744', light: '#ffffff' },
    }).catch((err: unknown) => console.error('[yaply:pairing] QR render failed', err))
  }, [code, size])

  return (
    <canvas
      ref={canvasRef}
      className="rounded-xl bg-white"
      style={{ width: size, height: size }}
      aria-label="Pairing QR code"
    />
  )
}
