import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { HeaderSkeleton, KpiSkeleton, LoadingPage } from '@/components/admin/skeletons'

export default function Loading() {
  return (
    <LoadingPage label="Loading overview">
      <HeaderSkeleton />
      <div className="grid grid-cols-1 gap-6">
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="h-80 p-5 lg:col-span-3">
            <Skeleton className="h-5 w-32" />
          </Card>
          <Card className="h-80 p-5 lg:col-span-2">
            <Skeleton className="h-5 w-32" />
          </Card>
        </div>
      </div>
    </LoadingPage>
  )
}
