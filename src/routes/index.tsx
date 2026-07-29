import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import YaplyLogo from '@/components/YaplyLogo'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

/* ------------------------------------------------------------------ */
/* Decrypt-scramble text effect                                        */
/* ------------------------------------------------------------------ */

const GLYPHS = '█▓▒░#$%&@+=/<>0123456789ABCDEF'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Renders the final text on the server (SEO / no-JS), then scrambles from
// cipher glyphs to plaintext once the element scrolls into view.
function DecryptText({
  text,
  delay = 0,
  durationMs = 1500,
  className,
  onComplete,
}: {
  text: string
  delay?: number
  durationMs?: number
  className?: string
  onComplete?: () => void
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [out, setOut] = useState(text)
  useEffect(() => {
    if (prefersReducedMotion()) {
      // Nothing will animate — fire immediately so anything sequenced after
      // this reveal (e.g. EncryptWire's `armed` gate) isn't stuck waiting.
      onComplete?.()
      return
    }
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      onComplete?.()
      return
    }
    let interval: ReturnType<typeof setInterval> | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        timeout = setTimeout(() => {
          let frame = 0
          const totalFrames = Math.round(durationMs / 32)
          interval = setInterval(() => {
            frame++
            const solved = Math.floor((frame / totalFrames) * text.length)
            if (solved >= text.length) {
              setOut(text)
              clearInterval(interval)
              onComplete?.()
              return
            }
            setOut(
              text
                .split('')
                .map((c, i) => (c === ' ' ? ' ' : i < solved ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
                .join(''),
            )
          }, 32)
        }, delay)
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (timeout) clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
    // onComplete intentionally omitted: re-subscribing on every render would
    // restart the observer. Setter functions passed in stay valid regardless.
  }, [text, delay, durationMs])
  return <span ref={ref} className={className}>{out}</span>
}

/* ------------------------------------------------------------------ */
/* Hero chat mockup — scripted encrypted conversation                  */
/* ------------------------------------------------------------------ */

interface ChatStep {
  who: 'them' | 'me' | 'cmd' | 'sys'
  text: string
  at: number
}

const CHAT_SCRIPT: ChatStep[] = [
  { who: 'them', text: 'flight lands at 9 — who has the airbnb code?', at: 900 },
  { who: 'me', text: 'me. sending it here, it’s encrypted anyway', at: 2100 },
  { who: 'me', text: '4482 🔑', at: 3100 },
  { who: 'cmd', text: '/remind 3h check in opens, key: 4482', at: 4200 },
  { who: 'sys', text: '⏰ Reminder set for 12:45 PM', at: 5100 },
  { who: 'them', text: 'ok this app is doing everything huh', at: 6300 },
]

function ChatMock() {
  // Server-rendered with the full conversation visible; the client replays it.
  const [visible, setVisible] = useState(CHAT_SCRIPT.length)
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    if (prefersReducedMotion()) return
    setVisible(0)
    const timers: ReturnType<typeof setTimeout>[] = []
    CHAT_SCRIPT.forEach((step, i) => {
      if (step.who === 'them') {
        timers.push(setTimeout(() => setTyping(true), Math.max(0, step.at - 650)))
      }
      timers.push(
        setTimeout(() => {
          setTyping(false)
          setVisible(i + 1)
        }, step.at),
      )
    })
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="lp-chat" aria-hidden="true">
      <div className="lp-chat-head">
        <span className="lp-chat-avatar">T</span>
        <div>
          <p className="lp-chat-name">Bali 2027 🌴</p>
          <p className="lp-chat-sub">  
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            end-to-end encrypted
          </p>
        </div>
      </div>
      <div className="lp-chat-body">
        {CHAT_SCRIPT.slice(0, visible).map((step, i) => {
          if (step.who === 'sys') {
            return (
              <div key={i} className="lp-msg-sys">{step.text}</div>
            )
          }
          if (step.who === 'cmd') {
            return (
              <div key={i} className="lp-msg lp-msg-me">
                <span className="lp-msg-cmd">{step.text}</span>
              </div>
            )
          }
          return (
            <div key={i} className={`lp-msg ${step.who === 'me' ? 'lp-msg-me' : 'lp-msg-them'}`}>
              <span className="lp-bubble">{step.text}</span>
            </div>
          )
        })}
        {typing && (
          <div className="lp-msg lp-msg-them">
            <span className="lp-bubble lp-typing">
              <i /><i /><i />
            </span>
          </div>
        )}
      </div>
      <div className="lp-chat-input">
        <span>Message…</span>
        <span className="lp-chat-send">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Plan → Event interactive demo                                       */
/* ------------------------------------------------------------------ */

const DAYS = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon']
const TIMES = ['5p', '6p', '7p', '8p', '9p', '10p']
// availability[row][col] = how many of the 3 others are free (0–3)
const AVAIL = [
  [1, 2, 0, 1, 1],
  [0, 2, 1, 1, 2],
  [1, 3, 2, 0, 2],
  [2, 2, 2, 1, 1],
  [1, 1, 0, 2, 2],
  [0, 1, 1, 2, 0],
]
const BEST_ROW = 2
const BEST_COL = 1

function EventFlowDemo() {
  const wrapRef = useRef<HTMLDivElement>(null)
  // Server-rendered on 'confirmed' (the best static snapshot); the client
  // rewinds to 'planning' and plays the flow when scrolled into view.
  const [mode, setMode] = useState<'planning' | 'confirmed'>('confirmed')
  const [painting, setPainting] = useState(true)
  const [mine, setMine] = useState<Set<number>>(() => new Set())
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playedRef = useRef(false)

  useEffect(() => {
    if (prefersReducedMotion()) return
    setMode('planning')
    setPainting(false)
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !playedRef.current) {
          playedRef.current = true
          setPainting(true)
          autoTimer.current = setTimeout(() => setMode('confirmed'), 3400)
          io.disconnect()
        }
      },
      { threshold: 0.45 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (autoTimer.current) clearTimeout(autoTimer.current)
    }
  }, [])

  const pick = (m: 'planning' | 'confirmed') => {
    if (autoTimer.current) clearTimeout(autoTimer.current)
    playedRef.current = true
    setPainting(true)
    setMode(m)
  }

  const toggleCell = (idx: number) => {
    if (autoTimer.current) clearTimeout(autoTimer.current)
    setMine((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div ref={wrapRef} className="lp-flow lp-glass">
      <div className="lp-flow-top">
        <span className="lp-flow-cmd">/plan friday dinner</span>
        <div className="lp-seg" role="tablist" aria-label="Event state">
          <button
            role="tab"
            aria-selected={mode === 'planning'}
            className={mode === 'planning' ? 'lp-seg-on' : ''}
            onClick={() => pick('planning')}
          >
            Planning
          </button>
          <button
            role="tab"
            aria-selected={mode === 'confirmed'}
            className={mode === 'confirmed' ? 'lp-seg-on' : ''}
            onClick={() => pick('confirmed')}
          >
            Confirmed
          </button>
        </div>
      </div>

      <div className="lp-flow-stage">
        {/* planning: when2meet-style heatmap */}
        <div className={`lp-flow-view ${mode === 'planning' ? 'lp-flow-active' : ''}`}>
          <div className={`lp-avail ${painting ? 'lp-paint' : ''}`}>
            <span className="lp-avail-corner" />
            {DAYS.map((d) => (
              <span key={d} className="lp-avail-day">{d}</span>
            ))}
            {AVAIL.map((row, r) => (
              [
                <span key={`t${r}`} className="lp-avail-time">{TIMES[r]}</span>,
                ...row.map((v, c) => {
                  const idx = r * DAYS.length + c
                  const lvl = Math.min(3, v + (mine.has(idx) ? 1 : 0))
                  const isBest = r === BEST_ROW && c === BEST_COL
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`lp-cell lp-lv${lvl} ${isBest ? 'lp-best' : ''} ${mine.has(idx) ? 'lp-mine' : ''}`}
                      style={{ ['--i' as string]: String(r * DAYS.length + c) }}
                      onClick={() => toggleCell(idx)}
                      aria-label={`${DAYS[c]} ${TIMES[r]}, ${lvl} free`}
                    />
                  )
                }),
              ]
            ))}
          </div>
          <p className="lp-flow-hint">tap the times you’re free — the best slot lights up</p>
        </div>

        {/* confirmed: event card */}
        <div className={`lp-flow-view ${mode === 'confirmed' ? 'lp-flow-active' : ''}`}>
          <div className="lp-event">
            <div className="lp-event-head">
              <h4>friday dinner 🍜</h4>
              <span className="lp-event-badge">confirmed</span>
            </div>
            <p className="lp-event-meta">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Fri · 7:00 PM&nbsp;&nbsp;·&nbsp;&nbsp;Mochi Ramen House
            </p>
            <div className="lp-rsvp">
              <span className="lp-rsvp-on">Going · 3</span>
              <span>Maybe · 1</span>
              <span>Can’t · 0</span>
            </div>
            <div className="lp-event-people">
              {['A', 'M', 'S', 'Y'].map((p, i) => (
                <span key={p} className="lp-face" style={{ ['--i' as string]: String(i) }}>{p}</span>
              ))}
              <span className="lp-event-note">everyone’s in — reminder set for 6:15</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* "Group that gets things done" carousel                              */
/* ------------------------------------------------------------------ */

interface CarouselSlide {
  key: string
  cmd: string
  title: string
  body: string
  visual: React.ReactNode
}

const CAROUSEL_SLIDES: CarouselSlide[] = [
  {
    key: 'tasks',
    cmd: '/task book the van',
    title: 'Tasks',
    body: 'Assign it instead of just saying it. Check it off in the chat and everyone watches it update, live.',
    visual: (
      <div className="lp-mini-tasks">
        <div className="lp-mini-task lp-task-done"><span className="lp-check" />Book the van</div>
        <div className="lp-mini-task lp-task-done"><span className="lp-check" />Confirm dates</div>
        <div className="lp-mini-task"><span className="lp-check" />Pack the tent</div>
      </div>
    ),
  },
  {
    key: 'notes',
    cmd: '/note wifi: hunter2',
    title: 'Notes',
    body: 'For the stuff that shouldn’t get buried forty messages down — the wifi password, the packing list, the address.',
    visual: (
      <div className="lp-mini-notes">
        <div className="lp-mini-note" style={{ ['--r' as string]: '-4deg' }}>
          <b>Wifi</b><span>hunter2</span>
        </div>
        <div className="lp-mini-note" style={{ ['--r' as string]: '3deg' }}>
          <b>Packing</b><span>passport, charger, sunscreen</span>
        </div>
      </div>
    ),
  },
  {
    key: 'albums',
    cmd: '/album beach day',
    title: 'Albums',
    body: 'Every camera roll from the trip, merged into one shared gallery. No more “can you send me that photo.”',
    visual: (
      <div className="lp-mini-grid">
        <span className="lp-mini-photo lp-mp-1" />
        <span className="lp-mini-photo lp-mp-2" />
        <span className="lp-mini-photo lp-mp-3" />
        <span className="lp-mini-photo lp-mp-4"><b>+12</b></span>
      </div>
    ),
  },
  {
    key: 'budgets',
    cmd: '/budget japan 2027',
    title: 'Budgets',
    body: 'Tracks who paid, who owes, and settles it — with Splitwise sync once the trip gets real.',
    visual: (
      <div className="lp-mini-ledger">
        <div className="lp-ledger-row"><span>Hotel</span><span>$420</span></div>
        <div className="lp-ledger-row"><span>Gas</span><span>$68</span></div>
        <div className="lp-ledger-total">you’re owed <b>$42</b></div>
      </div>
    ),
  },
]

function GroupCarousel() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = () => {
    if (autoTimer.current) clearInterval(autoTimer.current)
    autoTimer.current = null
  }
  const start = () => {
    if (prefersReducedMotion()) return
    stop()
    autoTimer.current = setInterval(() => {
      setIndex((i) => (i + 1) % CAROUSEL_SLIDES.length)
    }, 4200)
  }

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) start()
        else stop()
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      stop()
    }
  }, [])

  const go = (i: number) => {
    stop()
    setIndex((i + CAROUSEL_SLIDES.length) % CAROUSEL_SLIDES.length)
    start()
  }

  const active = CAROUSEL_SLIDES[index]

  return (
    <div ref={wrapRef} className="lp-car lp-glass" onMouseEnter={stop} onMouseLeave={start}>
      <div className="lp-car-head">
        <span className="lp-car-cmd">{active.cmd}</span>
        <div className="lp-car-nav">
          <button type="button" aria-label="Previous feature" onClick={() => go(index - 1)}>‹</button>
          <button type="button" aria-label="Next feature" onClick={() => go(index + 1)}>›</button>
        </div>
      </div>
      <div className="lp-car-viewport">
        <div className="lp-car-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {CAROUSEL_SLIDES.map((slide) => (
            <div className="lp-car-slide" key={slide.key}>
              <div className="lp-car-body">
                <div className="lp-car-copy">
                  <h3>{slide.title}</h3>
                  <p>{slide.body}</p>
                </div>
                <div className="lp-car-visual">{slide.visual}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="lp-car-dots" role="tablist" aria-label="Feature carousel">
        {CAROUSEL_SLIDES.map((slide, i) => (
          <button
            key={slide.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={slide.title}
            className={i === index ? 'lp-dot-on' : ''}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Kotha AI demo                                                        */
/* ------------------------------------------------------------------ */

function KothaDemo() {
  const wrapRef = useRef<HTMLDivElement>(null)
  // Server-rendered fully "done" (the readable end state); the client rewinds
  // and replays the thinking → summary beat once scrolled into view.
  const [phase, setPhase] = useState<'thinking' | 'done'>('done')
  const playedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const play = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPhase('thinking')
    timerRef.current = setTimeout(() => setPhase('done'), 1200)
  }, [])

  useEffect(() => {
    if (prefersReducedMotion()) return
    setPhase('done')
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !playedRef.current) {
          playedRef.current = true
          play()
          io.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [play])

  return (
    <div ref={wrapRef} className="lp-kotha lp-glass">
      <div className="lp-kotha-head">
        <span className="lp-kotha-badge">✨ Kotha · early access</span>
        <button type="button" className="lp-kotha-replay" onClick={play} aria-label="Replay">↺</button>
      </div>
      <div className="lp-kotha-thread" aria-hidden="true">
        <p>sarah: so are we doing the hotel with the pool</p>
        <p>mike: idk if we ever settled that</p>
        <p>jae: found one but it’s $40 more/night</p>
        <p>sarah: guys we leave in 4 days</p>
        <p>mike: fine by me tbh</p>
      </div>
      <div className="lp-kotha-arrow" aria-hidden="true">↓</div>
      {phase === 'thinking' ? (
        <div className="lp-kotha-thinking">
          <span className="lp-typing"><i /><i /><i /></span>
          reading the thread…
        </div>
      ) : (
        <div className="lp-kotha-summary">
          <ul>
            <li>Hotel’s decided — the pricier one, pool included</li>
            <li>No headcount yet — still needs confirming</li>
            <li>Trip is in 4 days</li>
          </ul>
          <div className="lp-kotha-actions">
            <span>📝 Note added</span>
            <span>✅ Task: confirm headcount</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* "What you see" → "what we see" encryption demo                      */
/* ------------------------------------------------------------------ */

const WIRE_PLAIN = 'hey, are we still on for 7pm?'

// Deterministic so the server-rendered sealed text and the client's final
// frame always match — no hydration mismatch, only the transient scramble
// frames (which only ever run after mount) are random.
function cipherOf(text: string): string {
  return text
    .split('')
    .map((c) => (c === ' ' ? ' ' : GLYPHS[c.charCodeAt(0) % GLYPHS.length]))
    .join('')
}
const WIRE_SEALED = cipherOf(WIRE_PLAIN)

// Number of characters actively flickering at the sweep's leading edge.
// Everything behind the wavefront is already locked to its real final
// glyph, so by the time the sweep reaches the end the text already equals
// WIRE_SEALED exactly — the "reveal" is just the label catching up, never a
// hard cut in the ciphertext itself.
const WIRE_WAVEFRONT = 4

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function EncryptWire({
  onSpotlight,
  armed,
}: {
  onSpotlight: (e: React.MouseEvent<HTMLDivElement>) => void
  // Gates the automatic scroll-triggered play — set once the "Sealed, end to
  // end." header above has finished its own decrypt reveal, so the two
  // animations always run in sequence rather than racing on scroll position.
  armed: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  // Server-rendered already sealed (the "what we see" end state); the client
  // rewinds to plaintext and replays the seal once scrolled into view AND armed.
  const [label, setLabel] = useState<'plain' | 'sealed'>('sealed')
  const [display, setDisplay] = useState(WIRE_SEALED)
  const [justSealed, setJustSealed] = useState(false)
  const [visible, setVisible] = useState(false)
  const playedRef = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout | typeof setInterval>[]>([])

  const play = useCallback(() => {
    timers.current.forEach(clearInterval)
    timers.current = []
    setJustSealed(false)
    setLabel('plain')
    setDisplay(WIRE_PLAIN)
    const hold = setTimeout(() => {
      let frame = 0
      const totalFrames = 30
      const interval = setInterval(() => {
        frame++
        const solved = Math.floor(easeInOutQuad(frame / totalFrames) * WIRE_PLAIN.length)
        setDisplay(
          WIRE_PLAIN
            .split('')
            .map((c, i) => {
              if (c === ' ') return ' '
              if (i < solved) return WIRE_SEALED[i] // locked — matches the final state exactly
              if (i < solved + WIRE_WAVEFRONT) return GLYPHS[Math.floor(Math.random() * GLYPHS.length)] // flickering
              return c // not yet reached
            })
            .join(''),
        )
        if (solved >= WIRE_PLAIN.length) {
          clearInterval(interval)
          const settle = setTimeout(() => {
            setLabel('sealed')
            setJustSealed(true)
            const clear = setTimeout(() => setJustSealed(false), 700)
            timers.current.push(clear)
          }, 200)
          timers.current.push(settle)
        }
      }, 42)
      timers.current.push(interval)
    }, 750)
    timers.current.push(hold)
  }, [])

  // Rewind to plaintext and watch for the card scrolling into view — but
  // don't play yet. Actually starting is gated separately on `armed` below.
  useEffect(() => {
    if (prefersReducedMotion()) return
    setLabel('plain')
    setDisplay(WIRE_PLAIN)
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Only start once the card is visible AND the header decrypt above has
  // finished — whichever condition is met last is what actually triggers it.
  useEffect(() => {
    if (prefersReducedMotion()) return
    if (visible && armed && !playedRef.current) {
      playedRef.current = true
      play()
    }
  }, [visible, armed, play])

  useEffect(() => () => { timers.current.forEach(clearInterval) }, [])

  return (
    <div ref={wrapRef} className="lp-wire lp-glass" onMouseMove={onSpotlight}>
      <div className="lp-wire-top">
        <span key={label} className="lp-wire-label">{label === 'plain' ? 'what you see' : 'what we see'}</span>
        <button type="button" className="lp-wire-replay" onClick={play} aria-label="Replay">↺</button>
      </div>
      <code className={`${label === 'sealed' ? 'lp-wire-sealed' : 'lp-wire-plain'} ${justSealed ? 'lp-wire-justsealed' : ''}`}>
        {display}
        {label === 'sealed' && <span className="lp-wire-dim lp-wire-note">&nbsp;&nbsp;— that’s the whole message.</span>}
      </code>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tiny translate-on-tap demo (used in the "small details" bento)      */
/* ------------------------------------------------------------------ */

function TranslateToggle() {
  const [translated, setTranslated] = useState(false)
  return (
    <button type="button" className="lp-translate" onClick={() => setTranslated((v) => !v)}>
      <span className="lp-translate-bubble">{translated ? 'Suena bien 👍' : 'Sounds good 👍'}</span>
      <span className="lp-translate-flag">{translated ? '🇪🇸 → 🇺🇸 tap to revert' : '🇺🇸 → 🇪🇸 tap to translate'}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const COMMANDS_A = ['/remind 30m water the plants', '/plan yosemite trip', '/task fix the login bug', '/budget japan 2027', '/event friday dinner 7pm']
const COMMANDS_B = ['/album beach day', '/note wifi: hunter2', '/mute 2h', '/thread', '/remind tomorrow call mom', '/task book the van']

const STEPS = [
  {
    n: '01',
    title: 'Made on your device',
    body: 'Your phone or laptop creates its own secret key the first time you sign in. It never leaves.',
  },
  {
    n: '02',
    title: 'Locked before it leaves',
    body: 'Every message is sealed on your device. Only the person you send it to holds the key that opens it.',
  },
  {
    n: '03',
    title: 'We see noise',
    body: 'All our servers ever store is scramble. No ads, no scanning, no “trust us” — there’s simply nothing to read.',
  },
]

function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [light, setLight] = useState(true)
  // Flips true once the "Sealed, end to end." header finishes decrypting —
  // gates EncryptWire so its plaintext→ciphertext sweep starts after, not
  // concurrently with, the header reveal.
  const [sealedHeaderDone, setSealedHeaderDone] = useState(false)

  // Progressive enhancement: everything is visible in the prerendered HTML;
  // the `lp-js` class opts elements into hidden/animated initial states.
  useEffect(() => {
    rootRef.current?.classList.add('lp-js')
  }, [])

  // Theme: saved preference, else light by default.
  useEffect(() => {
    const saved = localStorage.getItem('yaply-theme')
    if (saved === 'light') setLight(true)
    else if (saved === 'dark') setLight(false)
  }, [])
  // Match html/body to the page background so elastic overscroll (rubber-band
  // bounce past the top/bottom on trackpads and iOS) reveals the same color
  // instead of the default white behind the .lp div. Reset on unmount so
  // navigating to another route (light blue-slate theme) isn't left stuck dark.
  useEffect(() => {
    const bg = light ? '#eef2fb' : '#070d1a'
    document.documentElement.style.backgroundColor = bg
    document.body.style.backgroundColor = bg
  }, [light])
  useEffect(() => {
    return () => {
      document.documentElement.style.backgroundColor = ''
      document.body.style.backgroundColor = ''
    }
  }, [])
  const toggleTheme = () => {
    setLight((v) => {
      localStorage.setItem('yaply-theme', v ? 'dark' : 'light')
      return !v
    })
  }

  // One IntersectionObserver drives every [data-reveal] element.
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const els = root.querySelectorAll('[data-reveal]')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('lp-in')
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Scroll: parallax var + progress bar + condensing nav, one rAF-throttled listener.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const y = window.scrollY
        const doc = document.documentElement
        const max = doc.scrollHeight - window.innerHeight
        root.style.setProperty('--sy', String(y))
        root.style.setProperty('--sp', String(max > 0 ? y / max : 0))
        root.classList.toggle('lp-scrolled', y > 24)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // Cursor-tracked spotlight on glass cards.
  const spotlight = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }, [])

  return (
    <div ref={rootRef} className={`lp${light ? ' lp-light' : ''}`}>
      <style>{LP_CSS}</style>

      {/* scroll progress hairline */}
      <div className="lp-progress" aria-hidden="true" />

      {/* floating glass dock */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-nav-brand">
            <YaplyLogo variant="mark" size={26} />
            <span>yaply</span>
          </Link>
          <nav className="lp-nav-links">
            <a href="#plans">Events</a>
            <a href="#more">Features</a>
            <a href="#ai">AI</a>
            <a href="#sealed">Privacy</a>
          </nav>
          <div className="lp-nav-cta">
            <Link to="/auth" className="lp-btn-ghost">Sign in</Link>
            <Link to="/auth" className="lp-btn-solid">Open app</Link>
          </div>
        </div>
      </header>

      {/* floating theme toggle — pinned to the page's actual top-right corner */}
      <button
        type="button"
        className="lp-theme-corner"
        onClick={toggleTheme}
        aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {light ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4.5" />
            <line x1="12" y1="1.5" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22.5" />
            <line x1="3.3" y1="3.3" x2="5.1" y2="5.1" /><line x1="18.9" y1="18.9" x2="20.7" y2="20.7" />
            <line x1="1.5" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22.5" y2="12" />
            <line x1="3.3" y1="20.7" x2="5.1" y2="18.9" /><line x1="18.9" y1="5.1" x2="20.7" y2="3.3" />
          </svg>
        )}
      </button>

      {/* ---------------- hero ---------------- */}
      <section className="lp-hero">
        <div className="lp-orb lp-orb-a" aria-hidden="true" />
        <div className="lp-orb lp-orb-b" aria-hidden="true" />
        <div className="lp-orb lp-orb-c" aria-hidden="true" />
        <div className="lp-grid-tex" aria-hidden="true" />

        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
          
            <h1 className="lp-h1" data-reveal style={{ ['--d' as string]: '60ms' }}>
              Texting
              <br />
              <span className="lp-h1-grad">done right.</span>
            </h1>
            <p className="lp-sub" data-reveal style={{ ['--d' as string]: '140ms' }}>
              More than just messaging. Plan events, manage tasks, share memories, and let AI handle the details. 
            </p>
            <div className="lp-cta-row" data-reveal style={{ ['--d' as string]: '220ms' }}>
              <Link to="/auth" className="lp-btn-primary">
                Get Started
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <Link to="/auth" className="lp-btn-glass">Sign in</Link>
            </div>
         
          </div>

          <div className="lp-hero-visual" data-reveal style={{ ['--d' as string]: '180ms' }}>
            <ChatMock />
          </div>
        </div>
      </section>

      {/* ---------------- command marquee ---------------- */}
      <section className="lp-marquee-wrap" aria-label="Slash commands">
        <div className="lp-marquee">
          <div className="lp-marquee-track">
            {[...COMMANDS_A, ...COMMANDS_A].map((c, i) => (
              <span key={i} className="lp-chip">{c}</span>
            ))}
          </div>
        </div>
        <div className="lp-marquee">
          <div className="lp-marquee-track lp-marquee-rev">
            {[...COMMANDS_B, ...COMMANDS_B].map((c, i) => (
              <span key={i} className="lp-chip">{c}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- plan → event ---------------- */}
      <section className="lp-section" id="plans">
        <div className="lp-section-inner lp-flow-grid">
          <div className="lp-flow-copy">
            <h2 className="lp-h2" data-reveal style={{ ['--d' as string]: '60ms' }}>
              Plans that actually happen.
            </h2>
            <p className="lp-lede" data-reveal style={{ ['--d' as string]: '120ms' }}>
              Type <code className="lp-inline-cmd">/plan</code> and start planning your event.
              Everyone paints the times they’re free, the best slot lights up,
              and one tap turns it into a real event — with RSVPs, reminders,
              a shared album and a budget already attached. 
            </p>
            <ul className="lp-flow-list" data-reveal style={{ ['--d' as string]: '180ms' }}>
              <li>No “does thursday work??” × 40 messages</li>
              <li>No switching between five other apps</li>
              <li>RSVPs, reminders &amp; splitting the bill, built in</li>
            </ul>
          </div>
          <div data-reveal style={{ ['--d' as string]: '140ms' }}>
            <EventFlowDemo />
          </div>
        </div>
      </section>

      {/* ---------------- group carousel ---------------- */}
      <section className="lp-section" id="more">
        <div className="lp-section-inner">
          <h2 className="lp-h2" data-reveal style={{ ['--d' as string]: '60ms' }}>
            The group chat that gets things done.
          </h2>
          <p className="lp-lede" data-reveal style={{ ['--d' as string]: '120ms' }}>
            One slash command and the chat grows whatever the group actually needs.
          </p>
          <div className="lp-car-wrap" data-reveal style={{ ['--d' as string]: '160ms' }}>
            <GroupCarousel />
          </div>
        </div>
      </section>

      {/* ---------------- AI ---------------- */}
      <section className="lp-section" id="ai">
        <div className="lp-section-inner lp-flow-grid">
          <div data-reveal style={{ ['--d' as string]: '140ms' }}>
            <KothaDemo />
          </div>
          <div className="lp-flow-copy">
            <h2 className="lp-h2" data-reveal style={{ ['--d' as string]: '60ms' }}>
              AI that’s actually… useful.
            </h2>
            <p className="lp-lede" data-reveal style={{ ['--d' as string]: '120ms' }}>
              Most chat AI is a party trick nobody asked for. Our Kotha AI reads the room instead —
              wired into your notes, reminders and events, not bolted on top.
            </p>
            <ul className="lp-flow-list" data-reveal style={{ ['--d' as string]: '180ms' }}>
              <li>Turns a chaotic thread into three lines</li>
              <li>Files the follow-up as a task or reminder, automatically</li>
              <li>Surfaces the note or plan buried forty messages ago</li>
              <li>Only runs when you ask it to — nothing scanned quietly in the background</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------- privacy ---------------- */}
      <section className="lp-section" id="sealed">
        <div className="lp-section-inner">
          <h2 className="lp-h2" data-reveal style={{ ['--d' as string]: '60ms' }}>
            <DecryptText text="Sealed, end to end." delay={250} durationMs={1600} onComplete={() => setSealedHeaderDone(true)} />
          </h2>
          <p className="lp-lede" data-reveal style={{ ['--d' as string]: '120ms' }}>
            No security lecture. Three things worth knowing:
          </p>

          <div className="lp-steps">
            <div className="lp-steps-line" data-reveal aria-hidden="true" />
            {STEPS.map((s, i) => (
              <div key={s.n} className="lp-step lp-glass" data-reveal style={{ ['--d' as string]: `${120 + i * 110}ms` }} onMouseMove={spotlight}>
                <span className="lp-step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>

          <div data-reveal>
            <EncryptWire onSpotlight={spotlight} armed={sealedHeaderDone} />
          </div>
        </div>
      </section>

      {/* ---------------- small details ---------------- */}
      <section className="lp-section" id="details">
        <div className="lp-section-inner">
          <p className="lp-kicker" data-reveal>// obsessed with the details</p>
          <h2 className="lp-h2" data-reveal style={{ ['--d' as string]: '60ms' }}>
            A messaging platform built on small details.
          </h2>
          <p className="lp-lede" data-reveal style={{ ['--d' as string]: '120ms' }}>
            The stuff you don’t notice — until another app doesn’t have it.
          </p>

          <div className="lp-bento">
            <div className="lp-bento-card lp-glass lp-span-2" data-reveal onMouseMove={spotlight}>
              <h3>Reply without derailing</h3>
              <p>Quote a message inline, or peel a side conversation into its own thread — the group keeps talking while you sort out details.</p>
              <div className="lp-reply-demo">
                <div className="lp-reply-quote">flight lands at 9, who has the code?</div>
                <div className="lp-reply-new">4482 🔑</div>
              </div>
            </div>

            <div className="lp-bento-card lp-glass lp-span-2" data-reveal style={{ ['--d' as string]: '60ms' }} onMouseMove={spotlight}>
              <h3>Bring your own stickers</h3>
              <p>Upload a sticker pack once, or drop in a GIF mid-conversation — no separate app, no pasting image links.</p>
              <div className="lp-sticker-row" aria-hidden="true">
                <span className="lp-sticker">🦕</span>
                <span className="lp-sticker">🍜</span>
                <span className="lp-sticker">🎉</span>
                <span className="lp-gif-pill">GIF</span>
              </div>
            </div>

            <div className="lp-bento-card lp-glass lp-span-2" data-reveal style={{ ['--d' as string]: '100ms' }} onMouseMove={spotlight}>
              <h3>Nobody has to ask “what does this mean”</h3>
              <p>Tap any message to read it in your language. The sender never has to know you needed it.</p>
              <TranslateToggle />
            </div>

            <div className="lp-bento-card lp-glass lp-span-2" data-reveal style={{ ['--d' as string]: '140ms' }} onMouseMove={spotlight}>
              <h3>Everything starts with /</h3>
              <p>Tasks, notes, reminders, events, budgets — every feature is one slash command away. No menus to hunt through.</p>
              <div className="lp-cmd-stack" aria-hidden="true">
                <span className="lp-chip">/task</span>
                <span className="lp-chip">/remind</span>
                <span className="lp-chip">/budget</span>
              </div>
            </div>

            <div className="lp-bento-card lp-glass lp-span-2" data-reveal style={{ ['--d' as string]: '180ms' }} onMouseMove={spotlight}>
              <h3>Realtime, actually</h3>
              <p>Live delivery over WebSockets. No polling, no pull-to-refresh — messages land the moment they’re sent.</p>
              <div className="lp-ping" aria-hidden="true"><i /></div>
            </div>

            <div className="lp-bento-card lp-glass lp-span-2" data-reveal style={{ ['--d' as string]: '220ms' }} onMouseMove={spotlight}>
              <h3>Installs like an app</h3>
              <p>Add yaply to your home screen or dock straight from the browser. No store, no update nags.</p>
              <div className="lp-install" aria-hidden="true">
                <YaplyLogo variant="app-icon" size={30} />
                <span>Add to Home Screen</span>
                <b>+</b>
              </div>
            </div>

            <div className="lp-bento-card lp-glass lp-span-4" data-reveal style={{ ['--d' as string]: '260ms' }} onMouseMove={spotlight}>
              <h3>Web · iOS · Android</h3>
              <p>One account, every device. Your conversations follow you — same chats, same security, everywhere.</p>
            </div>

            <div className="lp-bento-card lp-glass lp-span-2 lp-closer" data-reveal style={{ ['--d' as string]: '300ms' }} onMouseMove={spotlight}>
              <h3>That’s the short list.</h3>
              <p>There’s plenty more waiting once you’re inside.</p>
              <Link to="/auth" className="lp-closer-link">
                Peek inside
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- final CTA ---------------- */}
      <section className="lp-section lp-final">
        <div className="lp-final-card lp-glass" data-reveal onMouseMove={spotlight}>
          <YaplyLogo variant="app-icon" size={56} />
          <h2 className="lp-h2">Chat Smarter, Not Harder.</h2>
          <p className="lp-lede"> Take the guesswork out of the group chat.</p>
          <Link to="/auth" className="lp-btn-primary lp-btn-big">Get started — it’s free</Link>
        </div>
      </section>

      <footer className="lp-footer">
        <YaplyLogo variant="mark" size={18} />
        <span>© {new Date().getFullYear()} yaply</span>
        <span className="lp-footer-mono">·&nbsp;&nbsp;Made by <a href="https://www.linkedin.com/in/wahid-kamruddin/" target="_blank" rel="noopener noreferrer">Wahid Kamruddin</a></span>
      </footer>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const LP_CSS = `
@font-face {
  font-family: 'Bricolage Grotesque';
  src: url('/fonts/BricolageGrotesque-var-latin.woff2') format('woff2-variations');
  font-weight: 200 800;
  font-display: swap;
}

.lp {
  --bg: #070d1a;
  --ink: #e9eefb;
  --dim: #8ba1c7;
  --faint: #5c718f;
  --blue: #5b8def;
  --sky: #8fb8ff;
  --sky-soft: rgba(143, 184, 255, 0.08);
  --sky-line: rgba(143, 184, 255, 0.25);
  --line: rgba(143, 184, 255, 0.13);
  --glass: rgba(143, 184, 255, 0.055);
  --tint: rgba(143, 184, 255, 0.1);
  --spot: rgba(143, 184, 255, 0.09);
  --card-shadow: 0 32px 80px rgba(3, 7, 18, 0.6);
  --disp: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif;
  --mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
  --sy: 0;
  --sp: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  min-height: 100vh;
  overflow-x: clip;
  -webkit-font-smoothing: antialiased;
  transition: background 0.45s, color 0.45s;
}
.lp-light {
  --bg: #eef2fb;
  --ink: #17233f;
  --dim: #53688f;
  --faint: #8ba0c2;
  --sky: #2f6fe0;
  --sky-soft: rgba(47, 111, 224, 0.07);
  --sky-line: rgba(47, 111, 224, 0.3);
  --line: rgba(23, 35, 63, 0.11);
  --glass: rgba(255, 255, 255, 0.55);
  --tint: rgba(23, 35, 63, 0.06);
  --spot: rgba(91, 141, 239, 0.1);
  --card-shadow: 0 28px 70px rgba(23, 35, 63, 0.16);
}
.lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
.lp ::selection { background: rgba(91,141,239,0.4); }
.lp-light ::selection { background: rgba(91,141,239,0.25); }

/* ---- scroll progress ---- */
.lp-progress {
  position: fixed; top: 0; left: 0; z-index: 60;
  height: 2px; width: 100%;
  background: linear-gradient(90deg, var(--blue), var(--sky));
  transform-origin: 0 0;
  transform: scaleX(var(--sp));
  pointer-events: none;
}

/* ---- glass dock nav ---- */
.lp-nav {
  position: fixed; top: 14px; left: 0; right: 0; z-index: 50;
  display: flex; justify-content: center;
  padding: 0 16px;
}
.lp-nav-inner {
  display: flex; align-items: center; gap: 20px;
  width: 100%; max-width: 760px;
  padding: 9px 10px 9px 16px;
  border-radius: 999px;
  border: 1px solid transparent;
  transition: background 0.35s, border-color 0.35s, box-shadow 0.35s, backdrop-filter 0.35s;
}
.lp-scrolled .lp-nav-inner {
  background: rgba(10, 17, 33, 0.62);
  border-color: var(--line);
  backdrop-filter: blur(18px) saturate(1.5);
  -webkit-backdrop-filter: blur(18px) saturate(1.5);
  box-shadow: 0 12px 40px rgba(3, 7, 18, 0.55);
}
.lp-light.lp-scrolled .lp-nav-inner {
  background: rgba(255, 255, 255, 0.65);
  box-shadow: 0 12px 36px rgba(23, 35, 63, 0.14);
}
.lp-nav-brand {
  display: flex; align-items: center; gap: 9px;
  text-decoration: none; color: var(--ink);
  font-family: var(--disp); font-weight: 700; font-size: 17px; letter-spacing: -0.02em;
}
.lp-nav-links { display: flex; gap: 18px; margin-left: auto; }
.lp-nav-links a {
  color: var(--dim); text-decoration: none; font-size: 13.5px; font-weight: 500;
  transition: color 0.2s;
}
.lp-nav-links a:hover { color: var(--ink); }
.lp-nav-cta { display: flex; gap: 8px; align-items: center; }
@media (max-width: 620px) { .lp-nav-links { display: none; } .lp-nav-cta { margin-left: auto; } }

/* Independent of the centered nav dock — pinned to the page's real corner,
   not the dock's edge, so it stays put regardless of dock width/content. */
.lp-theme-corner {
  position: fixed;
  top: max(16px, var(--safe-top, 0px));
  right: max(16px, var(--safe-right, 0px));
  z-index: 55;
  width: 38px; height: 38px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--glass);
  border: 1px solid var(--line);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  color: var(--dim); cursor: pointer;
  box-shadow: 0 10px 28px rgba(3,7,18,0.35);
  transition: color 0.2s, background 0.2s, border-color 0.3s, transform 0.3s;
}
.lp-theme-corner:hover { color: var(--ink); background: var(--tint); transform: rotate(18deg); }
@media (max-width: 480px) {
  .lp-theme-corner { width: 34px; height: 34px; top: max(12px, var(--safe-top, 0px)); right: max(12px, var(--safe-right, 0px)); }
}

.lp-btn-ghost {
  padding: 8px 14px; border-radius: 999px;
  color: var(--dim); text-decoration: none; font-size: 13.5px; font-weight: 500;
  transition: color 0.2s, background 0.2s;
}
.lp-btn-ghost:hover { color: var(--ink); background: var(--tint); }
.lp-btn-solid {
  padding: 8px 16px; border-radius: 999px;
  background: var(--blue); color: #fff;
  text-decoration: none; font-size: 13.5px; font-weight: 600;
  transition: transform 0.15s, box-shadow 0.2s, background 0.2s;
}
.lp-btn-solid:hover { transform: translateY(-1px); background: var(--sky); box-shadow: 0 6px 24px rgba(91,141,239,0.4); }

/* ---- reveal (JS-gated so prerendered HTML is never hidden) ---- */
.lp-js [data-reveal] {
  opacity: 0;
  transform: translateY(26px);
  transition: opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1);
  transition-delay: var(--d, 0ms);
}
.lp-js [data-reveal].lp-in { opacity: 1; transform: none; }

/* ---- hero ---- */
.lp-hero {
  position: relative;
  min-height: 100svh;
  display: flex; align-items: center;
  padding: 130px 24px 90px;
  overflow: clip;
}
.lp-orb {
  position: absolute; border-radius: 50%; filter: blur(90px);
  pointer-events: none; will-change: transform;
  transition: opacity 0.45s;
}
.lp-orb-a {
  width: 560px; height: 560px; top: -160px; right: -120px;
  background: radial-gradient(circle, rgba(91,141,239,0.28), transparent 65%);
  transform: translateY(calc(var(--sy) * 0.12px));
}
.lp-orb-b {
  width: 460px; height: 460px; bottom: -180px; left: -140px;
  background: radial-gradient(circle, rgba(28,66,140,0.35), transparent 65%);
  transform: translateY(calc(var(--sy) * -0.07px));
}
.lp-orb-c {
  width: 300px; height: 300px; top: 22%; left: 38%;
  background: radial-gradient(circle, rgba(143,184,255,0.10), transparent 65%);
  transform: translateY(calc(var(--sy) * -0.15px));
}
.lp-light .lp-orb-a { background: radial-gradient(circle, rgba(91,141,239,0.2), transparent 65%); }
.lp-light .lp-orb-b { background: radial-gradient(circle, rgba(143,184,255,0.28), transparent 65%); }
.lp-light .lp-orb-c { background: radial-gradient(circle, rgba(47,111,224,0.1), transparent 65%); }
.lp-grid-tex {
  position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(circle, rgba(143,184,255,0.10) 1px, transparent 1px);
  background-size: 30px 30px;
  mask-image: radial-gradient(ellipse 75% 65% at 50% 38%, #000 25%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse 75% 65% at 50% 38%, #000 25%, transparent 75%);
}
.lp-light .lp-grid-tex { background-image: radial-gradient(circle, rgba(23,35,63,0.13) 1px, transparent 1px); }
.lp-hero-inner {
  position: relative; z-index: 1;
  width: 100%; max-width: 1060px; margin: 0 auto;
  display: grid; grid-template-columns: 1.1fr 0.9fr;
  gap: clamp(36px, 6vw, 80px); align-items: center;
}
@media (max-width: 860px) {
  .lp-hero-inner { grid-template-columns: 1fr; }
  .lp-hero-visual { justify-self: center; }
}

.lp-eyebrow {
  display: inline-flex; align-items: center; gap: 9px;
  margin: 0 0 22px;
  font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--sky);
  padding: 7px 13px; border-radius: 999px;
  border: 1px solid var(--sky-line);
  background: var(--sky-soft);
}
.lp-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--sky);
  box-shadow: 0 0 0 0 rgba(143,184,255,0.5);
  animation: lp-pulse 2.2s ease-out infinite;
}
@keyframes lp-pulse {
  0% { box-shadow: 0 0 0 0 rgba(143,184,255,0.45); }
  70% { box-shadow: 0 0 0 9px rgba(143,184,255,0); }
  100% { box-shadow: 0 0 0 0 rgba(143,184,255,0); }
}

.lp-h1 {
  margin: 0 0 22px;
  font-family: var(--disp);
  font-size: clamp(46px, 7.2vw, 78px);
  font-weight: 750;
  letter-spacing: -0.035em;
  line-height: 1.0;
}
.lp-h1-grad {
  background: linear-gradient(100deg, var(--blue) 10%, var(--sky) 110%);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.lp-light .lp-h1-grad {
  background: linear-gradient(100deg, var(--blue) 10%, var(--sky) 110%);
  -webkit-background-clip: text; background-clip: text;
}
.lp-sub {
  margin: 0 0 34px; max-width: 46ch;
  color: var(--dim); font-size: clamp(15px, 1.8vw, 17px); line-height: 1.7;
}
.lp-cta-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }

.lp-btn-primary {
  display: inline-flex; align-items: center; gap: 9px;
  padding: 14px 26px; border-radius: 999px;
  background: linear-gradient(120deg, var(--blue), #3b6fe0);
  color: #fff; text-decoration: none; font-weight: 650; font-size: 15px; letter-spacing: -0.01em;
  box-shadow: 0 10px 34px rgba(91,141,239,0.36), inset 0 1px 0 rgba(255,255,255,0.22);
  transition: transform 0.16s, box-shadow 0.2s;
}
.lp-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 16px 44px rgba(91,141,239,0.5), inset 0 1px 0 rgba(255,255,255,0.22); }
.lp-btn-primary svg { transition: transform 0.2s; }
.lp-btn-primary:hover svg { transform: translateX(3px); }
.lp-btn-big { padding: 16px 34px; font-size: 16px; }

.lp-btn-glass {
  display: inline-flex; align-items: center;
  padding: 14px 24px; border-radius: 999px;
  background: var(--glass);
  border: 1px solid var(--line);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  color: var(--dim); text-decoration: none; font-weight: 550; font-size: 15px;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.lp-btn-glass:hover { color: var(--ink); border-color: rgba(143,184,255,0.35); background: var(--tint); }

.lp-spec {
  margin: 26px 0 0;
  font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.06em;
  color: var(--faint);
}

/* ---- chat mock ---- */
.lp-hero-visual { perspective: 1200px; }
.lp-chat {
  width: min(370px, 88vw);
  border-radius: 26px;
  border: 1px solid rgba(143,184,255,0.16);
  background: linear-gradient(160deg, rgba(20,32,60,0.72), rgba(11,19,38,0.82));
  backdrop-filter: blur(22px) saturate(1.4);
  -webkit-backdrop-filter: blur(22px) saturate(1.4);
  box-shadow: var(--card-shadow), inset 0 1px 0 rgba(255,255,255,0.07);
  transform: rotateY(-7deg) rotateX(2deg) translateY(calc(var(--sy) * -0.045px));
  transition: transform 0.4s cubic-bezier(0.22,1,0.36,1), background 0.45s, border-color 0.45s;
  overflow: hidden;
}
.lp-light .lp-chat {
  border-color: rgba(23,35,63,0.12);
  background: linear-gradient(160deg, rgba(255,255,255,0.82), rgba(240,244,253,0.9));
  box-shadow: var(--card-shadow), inset 0 1px 0 rgba(255,255,255,0.8);
}
.lp-chat:hover { transform: rotateY(0deg) rotateX(0deg) translateY(calc(var(--sy) * -0.045px)); }
.lp-chat-head {
  display: flex; align-items: center; gap: 11px;
  padding: 15px 17px;
  border-bottom: 1px solid var(--line);
}
.lp-chat-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: linear-gradient(135deg, var(--blue), #3b6fe0);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #fff;
}
.lp-chat-name { margin: 0; font-size: 13.5px; font-weight: 650; }
.lp-chat-sub {
  margin: 1px 0 0; display: flex; align-items: center; gap: 5px;
  font-family: var(--mono); font-size: 10px; color: var(--sky); letter-spacing: 0.04em;
}
.lp-chat-body {
  min-height: 268px;
  display: flex; flex-direction: column; justify-content: flex-end; gap: 8px;
  padding: 16px 14px;
}
.lp-msg { display: flex; }
.lp-msg-them { justify-content: flex-start; }
.lp-msg-me { justify-content: flex-end; }
.lp-bubble {
  max-width: 78%;
  padding: 9px 13px;
  font-size: 13px; line-height: 1.45;
  border-radius: 16px;
  animation: lp-pop 0.42s cubic-bezier(0.34,1.56,0.64,1) both;
}
.lp-msg-them .lp-bubble {
  background: var(--tint);
  border: 1px solid var(--line);
  border-bottom-left-radius: 5px;
  color: var(--ink);
}
.lp-light .lp-msg-them .lp-bubble { background: #fff; }
.lp-msg-me .lp-bubble {
  background: linear-gradient(120deg, var(--blue), #3b6fe0);
  border-bottom-right-radius: 5px;
  color: #fff;
}
.lp-msg-cmd {
  font-family: var(--mono); font-size: 12px;
  padding: 8px 12px; border-radius: 14px; border-bottom-right-radius: 5px;
  background: var(--sky-soft);
  border: 1px solid var(--sky-line);
  color: var(--sky);
  animation: lp-pop 0.42s cubic-bezier(0.34,1.56,0.64,1) both;
}
.lp-msg-sys {
  align-self: center;
  font-family: var(--mono); font-size: 10.5px; color: var(--faint);
  padding: 4px 11px; border-radius: 999px;
  background: var(--glass);
  animation: lp-pop 0.42s ease both;
}
@keyframes lp-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.96); }
  to { opacity: 1; transform: none; }
}
.lp-typing { display: inline-flex; gap: 4px; padding: 12px 14px; }
.lp-typing i {
  width: 5.5px; height: 5.5px; border-radius: 50%;
  background: var(--dim);
  animation: lp-bounce 1.15s ease-in-out infinite;
}
.lp-typing i:nth-child(2) { animation-delay: 0.15s; }
.lp-typing i:nth-child(3) { animation-delay: 0.3s; }
@keyframes lp-bounce { 0%,60%,100% { transform: none; opacity: 0.5; } 30% { transform: translateY(-4px); opacity: 1; } }
.lp-chat-input {
  display: flex; align-items: center; justify-content: space-between;
  margin: 0 12px 13px; padding: 10px 8px 10px 15px;
  border-radius: 999px;
  background: var(--tint);
  border: 1px solid var(--line);
  color: var(--faint); font-size: 12.5px;
}
.lp-chat-send {
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--blue); color: #fff;
  display: flex; align-items: center; justify-content: center;
}

/* ---- marquee ---- */
.lp-marquee-wrap {
  padding: 30px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  display: flex; flex-direction: column; gap: 14px;
  background: rgba(11,19,38,0.4);
  transition: background 0.45s;
}
.lp-light .lp-marquee-wrap { background: rgba(255,255,255,0.45); }
.lp-marquee {
  overflow: hidden;
  mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
}
.lp-marquee-track {
  display: flex; gap: 14px; width: max-content;
  animation: lp-slide 36s linear infinite;
}
.lp-marquee-rev { animation-direction: reverse; animation-duration: 42s; }
.lp-marquee:hover .lp-marquee-track { animation-play-state: paused; }
@keyframes lp-slide { to { transform: translateX(-50%); } }
.lp-chip {
  font-family: var(--mono); font-size: 12.5px; white-space: nowrap;
  color: var(--dim);
  padding: 9px 16px; border-radius: 999px;
  background: var(--glass); border: 1px solid var(--line);
  transition: color 0.2s, border-color 0.2s;
}
.lp-chip:hover { color: var(--sky); border-color: var(--sky-line); }

/* ---- sections ---- */
.lp-section { padding: clamp(80px, 11vw, 140px) 24px; position: relative; }
.lp-section-inner { max-width: 1060px; margin: 0 auto; }
.lp-kicker {
  margin: 0 0 14px;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.1em;
  color: var(--sky);
}
.lp-h2 {
  margin: 0 0 14px;
  font-family: var(--disp);
  font-size: clamp(30px, 4.6vw, 48px);
  font-weight: 720; letter-spacing: -0.03em; line-height: 1.05;
}
.lp-lede { margin: 0; color: var(--dim); font-size: 16.5px; line-height: 1.65; }
.lp-inline-cmd {
  font-family: var(--mono); font-size: 0.85em; color: var(--sky);
  background: var(--sky-soft); padding: 2px 7px; border-radius: 7px;
}

/* glass card base + cursor spotlight */
.lp-glass {
  position: relative;
  border-radius: 20px;
  border: 1px solid var(--line);
  background: var(--glass);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  overflow: hidden;
  transition: background 0.45s, border-color 0.45s;
}
.lp-glass::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(340px circle at var(--mx, 50%) var(--my, 50%), var(--spot), transparent 65%);
  opacity: 0; transition: opacity 0.3s;
  pointer-events: none;
}
.lp-glass:hover::before { opacity: 1; }

/* ---- plan → event ---- */
.lp-flow-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: clamp(32px, 5vw, 64px); align-items: center;
}
@media (max-width: 880px) { .lp-flow-grid { grid-template-columns: 1fr; } }
.lp-flow-list {
  margin: 22px 0 0; padding: 0; list-style: none;
  display: flex; flex-direction: column; gap: 10px;
}
.lp-flow-list li {
  position: relative; padding-left: 24px;
  color: var(--dim); font-size: 14.5px; line-height: 1.5;
}
.lp-flow-list li::before {
  content: '→';
  position: absolute; left: 0;
  color: var(--sky); font-family: var(--mono); font-size: 13px;
}
.lp-flow { padding: 20px; }
.lp-flow-top {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-bottom: 18px; flex-wrap: wrap;
}
.lp-flow-cmd {
  font-family: var(--mono); font-size: 12px; color: var(--sky);
  padding: 7px 12px; border-radius: 999px;
  background: var(--sky-soft); border: 1px solid var(--sky-line);
}
.lp-seg {
  display: flex; gap: 3px; padding: 3px;
  border-radius: 999px;
  background: var(--tint); border: 1px solid var(--line);
}
.lp-seg button {
  padding: 6px 14px; border-radius: 999px; border: none; cursor: pointer;
  background: transparent; color: var(--dim);
  font-size: 12.5px; font-weight: 600;
  transition: background 0.25s, color 0.25s;
}
.lp-seg .lp-seg-on {
  background: linear-gradient(120deg, var(--blue), #3b6fe0);
  color: #fff;
}
.lp-flow-stage { position: relative; min-height: 306px; }
.lp-flow-view {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; justify-content: center; gap: 12px;
  opacity: 0; transform: translateY(14px) scale(0.985);
  transition: opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1);
  pointer-events: none;
}
.lp-flow-view.lp-flow-active { opacity: 1; transform: none; pointer-events: auto; }

.lp-avail {
  display: grid;
  grid-template-columns: 30px repeat(5, 1fr);
  gap: 5px;
  align-items: center;
}
.lp-avail-corner { width: 100%; }
.lp-avail-day, .lp-avail-time {
  font-family: var(--mono); font-size: 10px; color: var(--faint);
  text-align: center;
}
.lp-avail-time { text-align: right; padding-right: 4px; }
.lp-cell {
  height: 30px; width: 100%;
  border-radius: 7px; border: 1px solid var(--line);
  cursor: pointer; padding: 0;
  transition: transform 0.15s, box-shadow 0.2s, background 0.3s;
}
.lp-cell:hover { transform: scale(1.06); }
.lp-lv0 { background: var(--glass); }
.lp-lv1 { background: rgba(91,141,239,0.22); }
.lp-lv2 { background: rgba(91,141,239,0.45); }
.lp-lv3 { background: rgba(91,141,239,0.8); border-color: rgba(143,184,255,0.5); }
.lp-light .lp-lv1 { background: rgba(91,141,239,0.18); }
.lp-light .lp-lv2 { background: rgba(91,141,239,0.4); }
.lp-light .lp-lv3 { background: rgba(59,111,224,0.85); }
.lp-mine { outline: 2px solid var(--sky); outline-offset: -2px; }
.lp-best { position: relative; }
.lp-paint .lp-best {
  animation: lp-best-glow 2.4s ease-in-out 1.6s infinite;
}
@keyframes lp-best-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(143,184,255,0); }
  50% { box-shadow: 0 0 14px 2px rgba(143,184,255,0.55); }
}
.lp-js .lp-avail .lp-cell { opacity: 0; }
.lp-js .lp-avail.lp-paint .lp-cell {
  animation: lp-cell-in 0.4s ease both;
  animation-delay: calc(var(--i) * 38ms);
}
@keyframes lp-cell-in {
  from { opacity: 0; transform: scale(0.7); }
  to { opacity: 1; transform: none; }
}
.lp-flow-hint {
  margin: 4px 0 0; text-align: center;
  font-family: var(--mono); font-size: 10.5px; color: var(--faint);
}

.lp-event {
  border-radius: 16px; padding: 22px;
  border: 1px solid var(--line);
  background: var(--tint);
}
.lp-event-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.lp-event h4 {
  margin: 0; font-family: var(--disp); font-size: 20px; font-weight: 680; letter-spacing: -0.02em;
}
.lp-event-badge {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--sky);
  padding: 4px 10px; border-radius: 999px;
  background: var(--sky-soft); border: 1px solid var(--sky-line);
}
.lp-event-meta {
  margin: 10px 0 0; display: flex; align-items: center; gap: 7px;
  color: var(--dim); font-size: 13.5px;
}
.lp-rsvp { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
.lp-rsvp span {
  font-size: 12.5px; font-weight: 600; color: var(--dim);
  padding: 7px 14px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--glass);
}
.lp-rsvp .lp-rsvp-on {
  color: #fff; border-color: transparent;
  background: linear-gradient(120deg, var(--blue), #3b6fe0);
}
.lp-event-people { display: flex; align-items: center; margin-top: 18px; }
.lp-face {
  width: 27px; height: 27px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, var(--blue), #3b6fe0);
  border: 2px solid var(--bg);
  margin-left: -7px;
}
.lp-face:first-child { margin-left: 0; }
.lp-flow-active .lp-face {
  animation: lp-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
  animation-delay: calc(0.25s + var(--i) * 90ms);
}
.lp-event-note { margin-left: 12px; font-size: 12px; color: var(--faint); }

/* ---- group carousel ---- */
.lp-car-wrap { margin-top: 52px; }
.lp-car { padding: 36px 40px; max-width: 860px; margin: 0 auto; }
.lp-car-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-bottom: 22px;
}
.lp-car-cmd {
  font-family: var(--mono); font-size: 12px; color: var(--sky);
  padding: 7px 12px; border-radius: 999px;
  background: var(--sky-soft); border: 1px solid var(--sky-line);
  transition: opacity 0.2s;
}
.lp-car-nav { display: flex; gap: 6px; }
.lp-car-nav button {
  width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--line);
  background: var(--tint); color: var(--dim);
  font-size: 17px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: color 0.2s, background 0.2s, transform 0.15s;
}
.lp-car-nav button:hover { color: var(--ink); background: var(--spot); transform: scale(1.08); }
.lp-car-viewport { overflow: hidden; border-radius: 16px; }
.lp-car-track {
  display: flex;
  transition: transform 0.55s cubic-bezier(0.65,0,0.35,1);
}
.lp-car-slide { flex: 0 0 100%; min-width: 0; }
.lp-car-body {
  display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 36px; align-items: center;
  min-height: 220px; padding: 6px 10px;
}
@media (max-width: 560px) { .lp-car-body { grid-template-columns: 1fr; min-height: unset; } }
.lp-car-copy h3 {
  margin: 0 0 12px; font-family: var(--disp); font-size: 26px; font-weight: 680; letter-spacing: -0.02em;
}
.lp-car-copy p { margin: 0; color: var(--dim); font-size: 15.5px; line-height: 1.7; }
.lp-car-visual { display: flex; align-items: center; justify-content: center; }
.lp-car-dots { display: flex; gap: 7px; justify-content: center; margin-top: 26px; }
.lp-car-dots button {
  width: 7px; height: 7px; border-radius: 999px; border: none; padding: 0; cursor: pointer;
  background: var(--line);
  transition: width 0.3s, background 0.3s;
}
.lp-car-dots .lp-dot-on { width: 22px; background: linear-gradient(90deg, var(--blue), var(--sky)); }

/* mini feature visuals inside the carousel */
.lp-mini-tasks { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 220px; }
.lp-mini-task {
  display: flex; align-items: center; gap: 9px;
  font-size: 12.5px; color: var(--dim);
  padding: 8px 12px; border-radius: 10px;
  background: var(--sky-soft); border: 1px solid var(--sky-line);
  backdrop-filter: blur(10px) saturate(1.4); -webkit-backdrop-filter: blur(10px) saturate(1.4);
}
.lp-check {
  width: 15px; height: 15px; border-radius: 5px; flex-shrink: 0;
  border: 1.5px solid var(--faint);
  position: relative;
}
.lp-task-done { color: var(--dim); text-decoration: line-through; text-decoration-color: var(--faint); }
.lp-task-done .lp-check {
  border-color: var(--sky); background: var(--sky-soft);
}
.lp-task-done .lp-check::after {
  content: ''; position: absolute; left: 3px; top: 0.5px; width: 4px; height: 8px;
  border: solid var(--sky); border-width: 0 2px 2px 0; transform: rotate(40deg);
}

.lp-mini-notes { position: relative; width: 100%; max-width: 220px; padding: 10px 0; }
.lp-mini-note {
  transform: rotate(var(--r, 0deg));
  background: var(--sky-soft); border: 1px solid var(--sky-line);
  backdrop-filter: blur(10px) saturate(1.4); -webkit-backdrop-filter: blur(10px) saturate(1.4);
  border-radius: 10px; padding: 10px 13px;
  display: flex; flex-direction: column; gap: 2px;
  box-shadow: 0 6px 16px rgba(3,7,18,0.15);
  margin-bottom: -8px;
}
.lp-mini-note b { font-size: 12px; color: var(--ink); }
.lp-mini-note span { font-size: 11.5px; color: var(--faint); font-family: var(--mono); }

.lp-mini-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;
  width: 100%; max-width: 180px;
}
.lp-mini-photo {
  aspect-ratio: 1; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #fff;
}
.lp-mp-1 { background: linear-gradient(135deg, #a9c8ff, #6ea0f5); }
.lp-mp-2 { background: linear-gradient(135deg, var(--blue), #3b6fe0); }
.lp-mp-3 { background: linear-gradient(135deg, #3b6fe0, #1f3f8f); }
.lp-mp-4 { background: rgba(143,184,255,0.14); border: 1px dashed var(--line); color: var(--dim); }

.lp-mini-ledger { display: flex; flex-direction: column; gap: 7px; width: 100%; max-width: 220px; }
.lp-ledger-row {
  display: flex; justify-content: space-between;
  font-size: 12.5px; color: var(--dim);
  padding: 7px 12px; border-radius: 9px;
  background: var(--sky-soft); border: 1px solid var(--sky-line);
  backdrop-filter: blur(10px) saturate(1.4); -webkit-backdrop-filter: blur(10px) saturate(1.4);
}
.lp-ledger-total {
  display: flex; justify-content: center;
  font-size: 12px; color: var(--sky);
  padding: 7px; margin-top: 2px;
}
.lp-ledger-total b { margin-left: 4px; }

/* ---- kotha AI demo ---- */
.lp-kotha { padding: 22px; max-width: 420px; margin: 0 auto; }
.lp-kotha-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
.lp-kotha-badge {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em;
  color: var(--sky);
  padding: 6px 12px; border-radius: 999px;
  background: var(--sky-soft); border: 1px solid var(--sky-line);
}
.lp-kotha-replay {
  width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--line);
  background: var(--tint); color: var(--dim); cursor: pointer; font-size: 14px;
  transition: color 0.2s, transform 0.3s;
}
.lp-kotha-replay:hover { color: var(--ink); transform: rotate(-45deg); }
.lp-kotha-thread {
  display: flex; flex-direction: column; gap: 5px;
  padding: 12px 14px; border-radius: 12px;
  background: var(--tint); border: 1px solid var(--line);
  opacity: 0.65;
}
.lp-kotha-thread p { margin: 0; font-size: 12px; color: var(--dim); line-height: 1.5; }
.lp-kotha-arrow { text-align: center; color: var(--faint); font-size: 15px; margin: 8px 0; }
.lp-kotha-thinking {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--mono); font-size: 12px; color: var(--faint);
  padding: 14px; justify-content: center;
}
.lp-kotha-thinking .lp-typing { padding: 0; }
.lp-kotha-summary {
  padding: 14px 16px; border-radius: 12px;
  background: var(--sky-soft); border: 1px solid var(--sky-line);
  animation: lp-pop 0.4s ease both;
}
.lp-kotha-summary ul { margin: 0; padding: 0 0 0 18px; display: flex; flex-direction: column; gap: 6px; }
.lp-kotha-summary li { font-size: 12.5px; color: var(--ink); line-height: 1.5; }
.lp-kotha-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.lp-kotha-actions span {
  font-size: 11px; font-weight: 600; color: var(--sky);
  padding: 5px 10px; border-radius: 999px;
  background: rgba(143,184,255,0.12); border: 1px solid var(--sky-line);
}

/* ---- small-details bento extras ---- */
.lp-reply-demo { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.lp-reply-quote {
  font-size: 11.5px; color: var(--faint);
  padding: 7px 10px; border-left: 2px solid var(--blue);
  background: var(--tint); border-radius: 0 8px 8px 0;
}
.lp-reply-new {
  align-self: flex-start;
  font-size: 12.5px; color: #fff; font-weight: 600;
  padding: 7px 13px; border-radius: 999px;
  background: linear-gradient(120deg, var(--blue), #3b6fe0);
}
.lp-sticker-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.lp-sticker {
  width: 34px; height: 34px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 17px;
  background: var(--tint); border: 1px solid var(--line);
}
.lp-gif-pill {
  font-family: var(--mono); font-size: 10.5px; font-weight: 700; color: var(--sky);
  padding: 6px 10px; border-radius: 999px;
  background: var(--sky-soft); border: 1px solid var(--sky-line);
}
.lp-translate {
  margin-top: 12px; display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
  background: none; border: none; padding: 0; cursor: pointer; text-align: left; width: 100%;
}
.lp-translate-bubble {
  font-size: 12.5px; color: var(--ink); font-weight: 550;
  padding: 8px 13px; border-radius: 999px;
  background: var(--tint); border: 1px solid var(--line);
}
.lp-translate-flag {
  font-family: var(--mono); font-size: 10.5px; color: var(--faint);
}
.lp-cmd-stack { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 12px; }
.lp-cmd-stack .lp-chip { padding: 6px 12px; font-size: 11.5px; }
.lp-closer { justify-content: space-between; }
.lp-closer-link {
  display: inline-flex; align-items: center; gap: 7px;
  margin-top: 2px;
  color: var(--sky); text-decoration: none; font-weight: 650; font-size: 13.5px;
}
.lp-closer-link svg { transition: transform 0.2s; }
.lp-closer-link:hover svg { transform: translateX(3px); }

/* steps */
.lp-steps {
  position: relative;
  margin-top: 54px;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
}
@media (max-width: 780px) { .lp-steps { grid-template-columns: 1fr; } }
.lp-steps-line {
  position: absolute; top: -22px; left: 4px; right: 4px; height: 1px;
  background: linear-gradient(90deg, var(--blue), var(--sky));
  transform-origin: 0 0;
}
.lp-js .lp-steps-line { transform: scaleX(0); transition: transform 1.3s cubic-bezier(0.22,1,0.36,1) 0.2s; opacity: 1; }
.lp-js .lp-steps-line.lp-in { transform: scaleX(1); }
.lp-step { padding: 26px 24px 28px; }
.lp-step-n {
  font-family: var(--mono); font-size: 12px; color: var(--blue);
  display: inline-block; margin-bottom: 14px;
}
.lp-step h3 {
  margin: 0 0 10px;
  font-family: var(--disp); font-size: 19px; font-weight: 650; letter-spacing: -0.015em;
}
.lp-step p { margin: 0; color: var(--dim); font-size: 13.8px; line-height: 1.7; }

.lp-wire {
  margin-top: 16px;
  padding: 20px 24px;
  display: flex; flex-direction: column; gap: 9px;
}
.lp-wire-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.lp-wire-label {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--faint);
  display: inline-block;
  animation: lp-label-fade 0.4s ease both;
}
@keyframes lp-label-fade {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: none; }
}
.lp-wire-replay {
  width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--line);
  background: var(--tint); color: var(--dim); cursor: pointer; font-size: 13px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  transition: color 0.2s, transform 0.3s;
}
.lp-wire-replay:hover { color: var(--ink); transform: rotate(-45deg); }
.lp-wire code {
  font-family: var(--mono); font-size: clamp(11.5px, 1.9vw, 14px);
  word-break: break-all;
  transition: color 0.4s;
}
.lp-wire-plain { color: var(--ink); }
.lp-wire-sealed { color: var(--sky); }
.lp-wire-dim { color: var(--faint); }
.lp-wire-note { display: inline-block; animation: lp-pop 0.45s ease both; animation-delay: 0.1s; opacity: 0; }
.lp-wire-justsealed { animation: lp-wire-seal 0.7s ease; }
@keyframes lp-wire-seal {
  0% { text-shadow: 0 0 0 rgba(143,184,255,0); }
  35% { text-shadow: 0 0 16px rgba(143,184,255,0.6); }
  100% { text-shadow: 0 0 0 rgba(143,184,255,0); }
}

/* bento */
.lp-bento {
  margin-top: 54px;
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px;
}
.lp-span-4 { grid-column: span 4; }
.lp-span-2 { grid-column: span 2; }
@media (max-width: 880px) { .lp-span-4, .lp-span-2 { grid-column: span 6; } }
@media (min-width: 620px) and (max-width: 880px) { .lp-span-2 { grid-column: span 3; } }
.lp-bento-card { padding: 28px 26px; display: flex; flex-direction: column; gap: 10px; }
.lp-bento-card h3 {
  margin: 0; font-family: var(--disp); font-size: 20px; font-weight: 650; letter-spacing: -0.015em;
}
.lp-bento-card p { margin: 0; color: var(--dim); font-size: 14px; line-height: 1.7; }
.lp-bento-card p code {
  font-family: var(--mono); font-size: 12.5px; color: var(--sky);
  background: var(--sky-soft); padding: 1.5px 6px; border-radius: 6px;
}
.lp-mini-panel { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.lp-mini-tab {
  font-size: 12.5px; font-weight: 550; color: var(--dim);
  padding: 7px 14px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--glass);
}
.lp-mini-on { color: #fff; background: linear-gradient(120deg, var(--blue), #3b6fe0); border-color: transparent; }
.lp-ping { position: relative; height: 34px; margin-top: 8px; }
.lp-ping i {
  position: absolute; left: 0; top: 50%; margin-top: -3px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--sky);
  box-shadow: 0 0 12px rgba(143,184,255,0.8);
  animation: lp-travel 2.6s cubic-bezier(0.5,0,0.4,1) infinite;
}
.lp-ping::before {
  content: '';
  position: absolute; left: 0; right: 0; top: 50%; height: 1px;
  background: linear-gradient(90deg, rgba(143,184,255,0.35), rgba(143,184,255,0.1));
}
@keyframes lp-travel {
  0% { left: 0; opacity: 0; }
  12% { opacity: 1; }
  88% { opacity: 1; }
  100% { left: calc(100% - 7px); opacity: 0; }
}
.lp-install {
  margin-top: 12px;
  display: flex; align-items: center; gap: 11px;
  padding: 10px 12px; border-radius: 14px;
  border: 1px dashed rgba(143,184,255,0.25);
  color: var(--dim); font-size: 13px; font-weight: 550;
}
.lp-light .lp-install { border-color: rgba(23,35,63,0.22); }
.lp-install b { margin-left: auto; color: var(--sky); font-size: 17px; font-weight: 500; }

/* final */
.lp-final { padding-bottom: 60px; }
.lp-final-card {
  max-width: 720px; margin: 0 auto;
  padding: clamp(44px, 7vw, 72px) 32px;
  display: flex; flex-direction: column; align-items: center; gap: 18px;
  text-align: center;
  border-radius: 30px;
}
.lp-final-card .lp-h2 { margin: 8px 0 0; }
.lp-final-card .lp-lede { margin-bottom: 10px; }
.lp-final-card .lp-spec { margin-top: 6px; }

/* footer */
.lp-footer {
  display: flex; align-items: center; justify-content: center; gap: 9px;
  padding: 26px 24px 34px;
  border-top: 1px solid var(--line);
  color: var(--faint); font-size: 13px;
}
.lp-footer-mono { font-family: var(--mono); font-size: 11px; }

/* reduced motion: no scramble replays (handled in JS), no ambient motion */
@media (prefers-reduced-motion: reduce) {
  .lp-js [data-reveal] { opacity: 1; transform: none; transition: none; }
  .lp-marquee-track, .lp-ping i, .lp-dot, .lp-typing i { animation: none; }
  .lp-chat { transform: none; }
  .lp-orb-a, .lp-orb-b, .lp-orb-c { transform: none; }
  .lp-js .lp-steps-line { transform: scaleX(1); transition: none; }
  .lp-js .lp-avail .lp-cell { opacity: 1; animation: none; }
  .lp-paint .lp-best { animation: none; }
  .lp-flow-view { transition: none; }
  .lp-car-track { transition: none; }
  .lp-kotha-summary { animation: none; }
  .lp-wire-label, .lp-wire-note { animation: none; opacity: 1; }
  .lp-wire-justsealed { animation: none; }
}
`
