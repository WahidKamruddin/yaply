import { useCallback, useEffect, useRef, useState } from 'react'
import { Trash2, Send, Mic } from 'lucide-react'

interface Props {
  // Called with the recorded audio once the user hits send.
  onSend: (blob: Blob, mime: string) => void
  // Called when the user discards, or when recording can't start.
  onCancel: () => void
  onError?: (message: string) => void
}

function pickMimeType(): string {
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Replaces the composer while recording a one-off voice message (mirrors the
// MessageRequestBar swap in ChatView). MediaRecorder + getUserMedia; all tracks
// are stopped on cancel / send / unmount.
export default function VoiceRecorderBar({ onSend, onCancel, onError }: Props) {
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [ready, setReady] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  // 'send' → hand the blob up; 'cancel' → discard. Set before recorder.stop().
  const intentRef = useRef<'send' | 'cancel'>('cancel')

  const cleanup = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false
    const mime = pickMimeType()

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
        recorderRef.current = rec
        chunksRef.current = []
        rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
        rec.onstop = () => {
          const type = rec.mimeType || mime || 'audio/webm'
          const blob = new Blob(chunksRef.current, { type })
          cleanup()
          if (intentRef.current === 'send' && blob.size > 0) onSend(blob, type)
          else onCancel()
        }
        rec.start()
        startedAtRef.current = Date.now()
        setReady(true)

        // Level meter
        try {
          const ctx = new AudioContext()
          audioCtxRef.current = ctx
          const src = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 256
          src.connect(analyser)
          const buf = new Uint8Array(analyser.frequencyBinCount)
          const tick = () => {
            analyser.getByteTimeDomainData(buf)
            let peak = 0
            for (const sample of buf) peak = Math.max(peak, Math.abs(sample - 128))
            setLevel(Math.min(1, peak / 96))
            setElapsed((Date.now() - startedAtRef.current) / 1000)
            rafRef.current = requestAnimationFrame(tick)
          }
          tick()
        } catch {
          // Level meter is decorative — a missing AudioContext must not break recording.
        }
      })
      .catch(() => {
        if (cancelled) return
        onError?.('Microphone access denied. Enable it in your browser settings to send a voice message.')
        onCancel()
      })

    return () => {
      cancelled = true
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.onstop = null
          recorderRef.current.stop()
        }
      } catch {
        // already stopped
      }
      cleanup()
    }
    // Start recording exactly once, on mount. The onstop closure captures the
    // mount-render onSend/onCancel — fine here since those just flip parent
    // state and the bar unmounts as soon as recording ends.
  }, [])

  const stop = (intent: 'send' | 'cancel') => {
    intentRef.current = intent
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    else {
      cleanup()
      onCancel()
    }
  }

  return (
    <div
      className="border-t border-border bg-surface px-4 pt-3 flex items-center gap-3"
      style={{ paddingBottom: `max(0.75rem, var(--safe-bottom))` }}
    >
      <button
        onClick={() => stop('cancel')}
        aria-label="Discard voice message"
        className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-text-subtle hover:text-red-500 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 size={18} />
      </button>

      <div className="flex-1 flex items-center gap-2 bg-tint border border-border rounded-2xl px-4 py-2.5">
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
        <span className="text-sm text-text font-mono tabular-nums flex-shrink-0">{fmt(elapsed)}</span>
        <div className="flex-1 h-4 flex items-center gap-0.5 overflow-hidden">
          {Array.from({ length: 32 }).map((_, i) => {
            const phase = Math.sin(i * 0.7 + elapsed * 6)
            const h = 2 + Math.max(0, phase) * level * 14
            return <span key={i} className="w-1 rounded-full bg-[#5b8def]/70" style={{ height: `${h}px` }} />
          })}
        </div>
      </div>

      <button
        onClick={() => stop('send')}
        disabled={!ready}
        aria-label="Send voice message"
        className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark hover:brightness-110 text-white shadow-[0_6px_18px_rgba(91,141,239,0.35)] disabled:opacity-40 transition-all"
      >
        {ready ? <Send size={16} /> : <Mic size={16} />}
      </button>
    </div>
  )
}
