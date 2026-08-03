import { User } from 'lucide-react'

interface Props {
  src?: string | null
  alt: string
  size?: number
  online?: boolean
  className?: string
}

export default function Avatar({ src, alt, size = 40, online, className = '' }: Props) {
  return (
    <div
      className={`relative flex-shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={alt} className="w-full h-full rounded-full object-cover" />
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
