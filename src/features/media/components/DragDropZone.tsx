import { useState, useCallback } from 'react'
import type { ReactNode } from 'react'

interface Props {
  onFileDrop: (file: File) => void
  children: ReactNode
  className?: string
}

export default function DragDropZone({ onFileDrop, children, className = '' }: Props) {
  const [dragging, setDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) onFileDrop(file)
    },
    [onFileDrop],
  )

  return (
    <div
      className={`relative ${className}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {dragging && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-xl pointer-events-none">
          <p className="text-primary font-medium text-sm">Drop to send</p>
        </div>
      )}
    </div>
  )
}
