import { Skeleton } from '@/components/ui/skeleton'
import { HeaderSkeleton, LoadingPage, TableSkeleton } from '@/components/admin/skeletons'

export default function Loading() {
  return (
    <LoadingPage label="Loading businesses">
      <HeaderSkeleton />
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-10 w-full rounded-lg sm:max-w-sm" />
        <Skeleton className="h-10 w-20 rounded-lg" />
      </div>
      <TableSkeleton rows={10} cols={6} />
    </LoadingPage>
  )
}
