import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { HeaderSkeleton, LoadingPage, TableSkeleton } from '@/components/admin/skeletons'

export default function Loading() {
  return (
    <LoadingPage label="Loading user">
      <Skeleton className="mb-3 h-5 w-24" />
      <HeaderSkeleton />
      <div className="grid grid-cols-1 gap-6">
        <Card className="flex flex-wrap gap-2 p-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-md" />
          ))}
        </Card>
        <Card className="h-64 p-5">
          <Skeleton className="h-5 w-32" />
        </Card>
        <TableSkeleton rows={3} cols={3} />
      </div>
    </LoadingPage>
  )
}
