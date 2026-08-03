import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  description: string
}

export default function ComingSoonPanel({ icon: Icon, title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 h-64">
      <div className="w-12 h-12 rounded-full bg-tint flex items-center justify-center">
        <Icon size={22} className="text-text-subtle" />
      </div>
      <div>
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="text-sm text-text-subtle mt-1 max-w-xs">{description}</p>
      </div>
    </div>
  )
}
