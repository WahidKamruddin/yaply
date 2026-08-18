import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

// Decoded QR content is untrusted input. We only ever pull the fragment param
// out of it — never navigate to the URL, never evaluate it.
function extractCode(raw: string): string | null {
  const m = /[#?&]c=([0-9A-Za-z]+)/.exec(raw)
  return m ? m[1] : raw.trim() || null
}

// Chrome/Android decode natively; everywhere else falls back to jsQR over a
// canvas frame. Desktops without a camera never render this component at all
// (see hasCamera in DevicePairingSettings) — the typed code is the path there.
export async function hasCamera(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.some((d) => d.kind === 'videoinput')
  } catch {
    return false
  }
}

interface Props {
  onScan: (code: string) => void
  onError: (message: string) => void
}

export default function QrScanner({ onScan, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [starting, setStarting] = useState(true)

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false

    async function run() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        const video = videoRef.current
        if (!video || stopped) return
        video.srcObject = stream
        await video.play()
        setStarting(false)

        const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector
        const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null

        const tick = async () => {
          if (stopped || !videoRef.current) return
          const v = videoRef.current
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            try {
              let raw: string | null = null
              if (detector) {
                const found = await detector.detect(v)
                raw = found[0]?.rawValue ?? null
              } else {
                const canvas = canvasRef.current
                if (canvas) {
                  canvas.width = v.videoWidth
                  canvas.height = v.videoHeight
                  const ctx = canvas.getContext('2d', { willReadFrequently: true })
                  if (ctx) {
                    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
                    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
                    raw = jsQR(img.data, img.width, img.height)?.data ?? null
                  }
                }
              }
              if (raw) {
                const code = extractCode(raw)
                if (code) {
                  stopped = true
                  onScan(code)
                  return
                }
              }
            } catch {
              // A single bad frame is normal — keep scanning.
            }
          }
          raf = requestAnimationFrame(() => void tick())
        }
        raf = requestAnimationFrame(() => void tick())
      } catch {
        onError('Could not access the camera. Enter the code by hand instead.')
      }
    }

    void run()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onScan, onError])

  return (
    <div className="relative w-full max-w-xs aspect-square rounded-2xl overflow-hidden bg-black">
      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      {starting && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">
          Starting camera…
        </div>
      )}
    </div>
  )
}
