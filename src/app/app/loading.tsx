import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  )
}
