import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  HeaderSkeleton,
  KpiSkeleton,
  LoadingPage,
  TableSkeleton,
} from '@/components/admin/skeletons'

export default function Loading() {
  return (
    <LoadingPage label="Loading business">
      <Skeleton className="mb-4 h-4 w-28" />
      <HeaderSkeleton action />
      <div className="grid grid-cols-1 gap-6">
        <KpiSkeleton />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="h-72 p-5">
            <Skeleton className="h-5 w-24" />
          </Card>
          <Card className="h-72 p-5">
            <Skeleton className="h-5 w-24" />
          </Card>
        </div>
        <TableSkeleton rows={3} cols={4} />
      </div>
    </LoadingPage>
  )
}
