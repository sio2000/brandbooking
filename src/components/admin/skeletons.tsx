import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function HeaderSkeleton({ action }: { action?: boolean }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-3">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-[70vw]" />
      </div>
      {action && <Skeleton className="h-10 w-28 rounded-lg" />}
    </div>
  )
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="grid gap-2 p-4">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-16" />
        </Card>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex gap-4 bg-surface-2/60 px-4 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-t border-border px-4 py-3.5">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={c === 0 ? 'h-4 flex-[1.6]' : 'h-4 flex-1'} />
          ))}
        </div>
      ))}
    </Card>
  )
}

/** Page-level loading shell announced to assistive tech. */
export function LoadingPage({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}
