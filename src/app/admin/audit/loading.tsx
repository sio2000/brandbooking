import { HeaderSkeleton, LoadingPage, TableSkeleton } from '@/components/admin/skeletons'

export default function Loading() {
  return (
    <LoadingPage label="Loading audit log">
      <HeaderSkeleton />
      <TableSkeleton rows={12} cols={6} />
    </LoadingPage>
  )
}
