import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { HeaderSkeleton, KpiSkeleton, LoadingPage } from '@/components/admin/skeletons'

export default function Loading() {
  return (
    <LoadingPage label="Loading statistics">
      <HeaderSkeleton action />
      <div className="grid grid-cols-1 gap-6">
        <KpiSkeleton />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="h-72 p-5">
              <Skeleton className="h-5 w-32" />
            </Card>
          ))}
        </div>
      </div>
    </LoadingPage>
  )
}
