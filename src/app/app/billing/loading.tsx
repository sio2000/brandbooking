import { PageContainer } from '@/components/dashboard/page-header'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <PageContainer className="max-w-5xl">
      <div role="status" aria-label="Loading billing">
        <div className="mb-6 grid gap-2 sm:mb-8">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-1 content-start gap-6">
            <Card className="grid grid-cols-1 gap-4 p-6">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-12 w-32" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-12 w-56 rounded-xl" />
            </Card>
            <Card className="grid grid-cols-1 gap-3 p-5">
              <Skeleton className="h-4 w-32" />
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </Card>
          </div>
          <div className="grid grid-cols-1 content-start gap-6">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="grid grid-cols-1 gap-3 p-5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
