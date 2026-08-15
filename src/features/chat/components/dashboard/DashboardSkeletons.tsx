import Skeleton from '@/components/Skeleton'

export function DashboardRowSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="flex items-start gap-2.5 px-1 py-2" style={{ animationDelay: `${delay}ms` }}>
      <Skeleton className="w-3 h-3 rounded-sm mt-1 flex-shrink-0" style={{ animationDelay: `${delay}ms` }} />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-3.5 w-3/4" style={{ animationDelay: `${delay}ms` }} />
        <Skeleton className="h-2.5 w-1/2" style={{ animationDelay: `${delay}ms` }} />
      </div>
    </div>
  )
}

export function DashboardFriendSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="flex items-center gap-2 px-2 py-2" style={{ animationDelay: `${delay}ms` }}>
      <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" style={{ animationDelay: `${delay}ms` }} />
      <Skeleton className="h-3 w-16" style={{ animationDelay: `${delay}ms` }} />
    </div>
  )
}
