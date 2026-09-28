import { HeaderSkeleton, KpiSkeleton, LoadingPage, TableSkeleton } from '@/components/admin/skeletons'

export default function Loading() {
  return (
    <LoadingPage label="Loading system health">
      <HeaderSkeleton />
      <div className="grid grid-cols-1 gap-6">
        <KpiSkeleton count={6} />
        <TableSkeleton rows={4} cols={4} />
        <TableSkeleton rows={4} cols={4} />
      </div>
    </LoadingPage>
  )
}
