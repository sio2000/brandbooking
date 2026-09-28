import { PageContainer } from '@/components/dashboard/page-header'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

function ChartSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <div className="space-y-2 px-5 pt-5 pb-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
      <div className="px-5 pb-5">
        <Skeleton className="h-60 w-full rounded-lg" />
      </div>
    </Card>
  )
}

export default function AnalyticsLoading() {
  return (
    <PageContainer wide>
      <div role="status" aria-label="Loading analytics">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-10 w-40 rounded-lg" />
        </div>
        <div className="mb-6 flex flex-wrap gap-2">
          <Skeleton className="h-10 w-full rounded-lg sm:w-64" />
          <Skeleton className="h-10 w-full rounded-lg sm:w-52" />
          <Skeleton className="h-10 w-full rounded-lg sm:w-52" />
          <Skeleton className="h-3.5 w-56 basis-full" />
        </div>
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Card key={i} className="space-y-3 p-4 sm:p-5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-3 w-28" />
              </Card>
            ))}
          </div>
          <Card className="space-y-3 p-5">
            <Skeleton className="h-4 w-24" />
            <div className="grid gap-2.5 md:grid-cols-2">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          </Card>
          <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
          <div className="grid gap-4 sm:gap-6 xl:grid-cols-5">
            <ChartSkeleton className="xl:col-span-3" />
            <ChartSkeleton className="xl:col-span-2" />
          </div>
          <ChartSkeleton />
        </div>
        <span className="sr-only">Loading analytics…</span>
      </div>
    </PageContainer>
  )
}
