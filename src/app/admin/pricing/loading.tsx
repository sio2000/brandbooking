import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { HeaderSkeleton, LoadingPage, TableSkeleton } from '@/components/admin/skeletons'

export default function Loading() {
  return (
    <LoadingPage label="Loading pricing">
      <HeaderSkeleton action />
      <div className="grid grid-cols-1 gap-6">
        <Card className="grid gap-3 p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </Card>
        <TableSkeleton rows={4} cols={4} />
      </div>
    </LoadingPage>
  )
}
