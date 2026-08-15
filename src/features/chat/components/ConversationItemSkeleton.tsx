import Skeleton from '@/components/Skeleton'

export default function ConversationItemSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3" style={{ animationDelay: `${delay}ms` }}>
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" style={{ animationDelay: `${delay}ms` }} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-28" style={{ animationDelay: `${delay}ms` }} />
          <Skeleton className="h-2.5 w-8 flex-shrink-0" style={{ animationDelay: `${delay}ms` }} />
        </div>
        <Skeleton className="h-2.5 w-40 max-w-full" style={{ animationDelay: `${delay}ms` }} />
      </div>
    </div>
  )
}
