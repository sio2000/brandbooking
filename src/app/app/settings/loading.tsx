import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** Shown inside the settings layout (header + tabs stay visible) while a tab loads. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading settings" className="grid grid-cols-1 gap-5">
      <div className="grid grid-cols-1 gap-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Card className="divide-y divide-border p-5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-4 py-6 first:pt-0 last:pb-0 md:grid-cols-[15rem_1fr] md:gap-8"
          >
            <div className="grid grid-cols-1 content-start gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-3 w-36" />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}
