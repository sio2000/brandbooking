import {
  HeaderSkeleton,
  KpiSkeleton,
  LoadingPage,
  TableSkeleton,
} from '@/components/admin/skeletons'

export default function Loading() {
  return (
    <LoadingPage label="Loading usage">
      <HeaderSkeleton />
      <div className="grid grid-cols-1 gap-6">
        <KpiSkeleton count={4} />
        <TableSkeleton rows={3} cols={5} />
      </div>
    </LoadingPage>
  )
}
