// Send animation: the composer's text box *becomes* the new bubble. The field
// background detaches, morphs into the bubble's shape and colour, and flies
// into the list carrying the text. Modelled on Telegram-iOS, the open-source
// client with the same effect (ChatMessageTransitionNode +
// ChatMessageBubbleItemNode.animateContentFromTextInputField):
//   - 300ms total
//   - X and Y on separate curves, so the path bows instead of running straight
//   - the background animates from the input field's frame to the bubble's
//   - the real bubble stays hidden until the flight lands
// iOS mirrors this in SendFlightOverlay.swift.
//
// Only `transform` and `opacity` are animated, so the browser runs the whole
// flight on the compositor. A send kicks off encryption, a React re-render and
// a refetch at the same moment; anything on the main thread (a colour tween,
// width/height) visibly stutters under that. So:
//   - the size morph is a scale on the fill layers, with elliptical radii
//     pre-divided by the scale so the start frame matches the field's corners
//   - colour changes are crossfades between stacked layers, never tweens
//   - the text is a clone at the bubble's final width, so it never reflows
//
// The row must keep a stable React key across the pending → confirmed swap
// (ChatView's renderKeyRef): a remount mid-flight would reveal the bubble early.

const DURATION_MS = 300
// Telegram's curves: vertical eases in and out, horizontal is fast-out.
const EASE_Y = 'cubic-bezier(0.199, 0.011, 0.279, 0.910)'
const EASE_X = 'cubic-bezier(0.23, 1, 0.32, 1)'
const FADE_MS = DURATION_MS * 0.55

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface FlightOptions {
  // The composer textarea, measured before it's cleared.
  source: HTMLTextAreaElement
  // Re-queried on the next frame, after the composer has shrunk and the list
  // has been re-pinned to the bottom.
  getTarget: () => HTMLElement | null
  // Called right before the flight's first frame, so the caller can re-pin
  // the scroll position against the settled layout.
  beforeMeasure?: () => void
  onDone: () => void
}

function layer(styles: Partial<CSSStyleDeclaration>): HTMLElement {
  const el = document.createElement('div')
  Object.assign(el.style, { position: 'absolute', inset: '0', ...styles })
  return el
}

// Returns false when no flight could be started (reduced motion, hidden tab,
// or the bubble isn't laid out). The caller then falls back to the plain
// slide-in.
export function startSendFlight({ source, getTarget, beforeMeasure, onDone }: FlightOptions): boolean {
  if (prefersReducedMotion() || document.hidden) return false
  const initialTarget = getTarget()
  if (!initialTarget || typeof initialTarget.animate !== 'function') return false

  // The field box, and where its first glyph sits, vs. the same inside the bubble.
  const field = source.getBoundingClientRect()
  const srcStyle = getComputedStyle(source)
  const textLeft = field.left + parseFloat(srcStyle.borderLeftWidth) + parseFloat(srcStyle.paddingLeft)
  const textTop = field.top + parseFloat(srcStyle.borderTopWidth) + parseFloat(srcStyle.paddingTop) - source.scrollTop
  const tgtStyle = getComputedStyle(initialTarget)
  const startX = textLeft - parseFloat(tgtStyle.paddingLeft)
  const startY = textTop - parseFloat(tgtStyle.paddingTop)
  const fieldRadius = parseFloat(srcStyle.borderTopLeftRadius) || 0

  // outer moves on X, inner on Y (one curve per axis); inner is bubble-sized.
  const outer = document.createElement('div')
  outer.setAttribute('aria-hidden', 'true')
  Object.assign(outer.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    pointerEvents: 'none',
    zIndex: '60',
    transform: `translateX(${startX}px)`,
    willChange: 'transform',
  })
  const inner = document.createElement('div')
  Object.assign(inner.style, { position: 'relative', transform: `translateY(${startY}px)`, willChange: 'transform' })
  outer.append(inner)

  // Fill layers: the field's own background (fading out) and the bubble's
  // gradient (fading in), both morphing from the field's frame to the bubble's.
  const fieldFill = layer({
    backgroundColor: srcStyle.backgroundColor,
    border: `${srcStyle.borderTopWidth} solid ${srcStyle.borderTopColor}`,
    boxSizing: 'border-box',
    transformOrigin: '0 0',
  })
  const bubbleFill = layer({
    backgroundImage: tgtStyle.backgroundImage,
    backgroundColor: tgtStyle.backgroundColor,
    borderRadius: tgtStyle.borderRadius,
    transformOrigin: '0 0',
    opacity: '0',
  })

  // Text layers: clones of the real bubble with the fill stripped — one in
  // the composer's colour (fading out), one as the bubble renders it.
  const textLayer = (): HTMLElement => {
    const el = initialTarget.cloneNode(true) as HTMLElement
    el.removeAttribute('data-bubble')
    Object.assign(el.style, {
      position: 'absolute',
      inset: '0',
      margin: '0',
      boxSizing: 'border-box',
      transition: 'none',
      backgroundImage: 'none',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      boxShadow: 'none',
    })
    return el
  }
  const bubbleText = textLayer()
  bubbleText.style.opacity = '0'
  const plainText = textLayer()
  plainText.style.color = srcStyle.color
  plainText.querySelectorAll<HTMLElement>('*').forEach((el) => { el.style.color = 'inherit' })

  inner.append(fieldFill, bubbleFill, plainText, bubbleText)

  // Sizes everything to the bubble and returns the transform that maps the
  // bubble-sized fill layers onto the field's box at the start position.
  const fit = (w: number, h: number): string => {
    inner.style.width = `${w}px`
    inner.style.height = `${h}px`
    const sx = field.width / w
    const sy = field.height / h
    // Elliptical radii pre-divided by the scale, so the scaled start frame
    // shows the field's real corners rather than stretched ones.
    fieldFill.style.borderRadius = `${fieldRadius / sx}px / ${fieldRadius / sy}px`
    return `translate(${field.left - startX}px, ${field.top - startY}px) scale(${sx}, ${sy})`
  }
  const r0 = initialTarget.getBoundingClientRect()
  const fillStart0 = fit(r0.width, r0.height)
  fieldFill.style.transform = fillStart0
  bubbleFill.style.transform = fillStart0

  document.body.append(outer)
  initialTarget.style.visibility = 'hidden'

  let finished = false
  const finish = (target: HTMLElement) => {
    if (finished) return
    finished = true
    target.style.visibility = ''
    outer.remove()
    onDone()
  }

  requestAnimationFrame(() => {
    beforeMeasure?.()
    const target = getTarget() ?? initialTarget
    if (target !== initialTarget) initialTarget.style.visibility = ''
    target.style.visibility = 'hidden'
    const r = target.getBoundingClientRect()
    // Bubble never made it on screen (e.g. taller than the viewport): just
    // reveal it rather than flying somewhere the user can't see.
    if (!target.isConnected || r.top < 0 || r.bottom > window.innerHeight) {
      finish(target)
      return
    }
    const fillStart = fit(r.width, r.height)

    const timing = (easing: string): KeyframeAnimationOptions => ({ duration: DURATION_MS, easing, fill: 'forwards' })
    const fade: KeyframeAnimationOptions = { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' }

    const moveX = outer.animate(
      [{ transform: `translateX(${startX}px)` }, { transform: `translateX(${r.left}px)` }],
      timing(EASE_X),
    )
    const moveY = inner.animate(
      [{ transform: `translateY(${startY}px)` }, { transform: `translateY(${r.top}px)` }],
      timing(EASE_Y),
    )
    // The size morph rides the vertical curve, which is the slower of the two.
    for (const fill of [fieldFill, bubbleFill]) {
      fill.animate([{ transform: fillStart }, { transform: 'none' }], timing(EASE_Y))
    }
    fieldFill.animate([{ opacity: 1 }, { opacity: 0 }], fade)
    bubbleFill.animate([{ opacity: 0 }, { opacity: 1 }], fade)
    plainText.animate([{ opacity: 1 }, { opacity: 0 }], fade)
    bubbleText.animate([{ opacity: 0 }, { opacity: 1 }], fade)

    Promise.all([moveX.finished, moveY.finished]).then(() => finish(target), () => finish(target))
  })

  return true
}
