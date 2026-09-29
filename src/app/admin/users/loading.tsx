import { Skeleton } from '@/components/ui/skeleton'
import { HeaderSkeleton, LoadingPage, TableSkeleton } from '@/components/admin/skeletons'

export default function Loading() {
  return (
    <LoadingPage label="Loading users">
      <HeaderSkeleton />
      <div className="mb-4 grid gap-3">
        <div className="flex gap-2">
          <Skeleton className="h-10 w-full rounded-lg sm:max-w-sm" />
          <Skeleton className="h-10 w-20 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-80 max-w-full rounded-xl" />
      </div>
      <TableSkeleton rows={10} cols={6} />
    </LoadingPage>
  )
}
