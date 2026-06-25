import { useId } from 'react'

interface Props {
  size?: number
  /** 'mark' = Y icon only | 'horizontal' = Y + wordmark | 'app-icon' = Y on dark rounded square */
  variant?: 'mark' | 'horizontal' | 'app-icon'
  className?: string
}

/**
 * Y mark: three connected pill arms meeting at a central junction.
 * viewBox 0 0 80 80, junction at (40, 46)
 *
 * Left arm:  translate(25.86 31.86) rotate(-45) → tip (11.72, 17.72)
 * Right arm: translate(54.14 31.86) rotate(45)  → tip (68.28, 17.72)
 * Stem:      rect x=33 y=39 w=14 h=37 rx=7     → bottom y=76
 */
function YMark({ size, gradId }: { size: number; gradId: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradId} x1="7" y1="13" x2="74" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6BA8FF" />
          <stop offset="100%" stopColor="#3B6FE0" />
        </linearGradient>
      </defs>

      {/* Left arm */}
      <rect x="-7" y="-20" width="14" height="40" rx="7"
        fill={`url(#${gradId})`}
        transform="translate(25.86 31.86) rotate(-45)" />

      {/* Right arm */}
      <rect x="-7" y="-20" width="14" height="40" rx="7"
        fill={`url(#${gradId})`}
        transform="translate(54.14 31.86) rotate(45)" />

      {/* Stem */}
      <rect x="33" y="39" width="14" height="37" rx="7" fill={`url(#${gradId})`} />
    </svg>
  )
}

export default function YaplyLogo({ size = 40, variant = 'mark', className }: Props) {
  const uid = useId().replace(/:/g, '')
  const gradId = `yg${uid}`

  if (variant === 'app-icon') {
    const radius = Math.round(size * 0.22)
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: '#1a2744',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <YMark size={Math.round(size * 0.68)} gradId={gradId} />
      </div>
    )
  }

  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        <YMark size={size} gradId={gradId} />
        <span
          style={{
            fontSize: Math.round(size * 0.72),
            fontWeight: 700,
            color: '#1a2744',
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          yaply
        </span>
      </div>
    )
  }

  return <YMark size={size} gradId={gradId} />
}
