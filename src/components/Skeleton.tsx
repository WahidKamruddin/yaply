import type { CSSProperties } from 'react'

interface Props {
  className?: string
  style?: CSSProperties
}

export default function Skeleton({ className = '', style }: Props) {
  return <div className={`skeleton rounded-md ${className}`} style={style} aria-hidden="true" />
}
