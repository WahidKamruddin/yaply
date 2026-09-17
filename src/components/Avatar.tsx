import { useState } from 'react'
import { User } from 'lucide-react'

interface Props {
  src?: string | null
  alt: string
  size?: number
  online?: boolean
  className?: string
  /** Fires when src fails to load, so a host can treat a broken URL as "no photo". */
  onLoadError?: () => void
}

export default function Avatar({ src, alt, size = 40, online, className = '', onLoadError }: Props) {
  // Track the src that failed rather than a bare boolean, so a later src (a new
  // upload, a different person in a reused row) retries instead of staying stuck
  // on the placeholder.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = !!src && src !== failedSrc

  return (
    <div
      className={`relative flex-shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt}
          // Google serves OAuth avatars from lh3.googleusercontent.com and 403s
          // some of them when a cross-origin Referer is attached.
          referrerPolicy="no-referrer"
          onError={() => { setFailedSrc(src); onLoadError?.() }}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <div className="w-full h-full rounded-full bg-tint-strong flex items-center justify-center overflow-hidden">
          <User size={Math.round(size * 0.55)} className="text-text-subtle" strokeWidth={1.75} />
        </div>
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-surface ${online ? 'bg-green-500' : 'bg-offline'}`}
        />
      )}
    </div>
  )
}
