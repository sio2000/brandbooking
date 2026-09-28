import { HeaderSkeleton, LoadingPage, TableSkeleton } from '@/components/admin/skeletons'

export default function Loading() {
  return (
    <LoadingPage label="Loading feature flags">
      <HeaderSkeleton action />
      <TableSkeleton rows={5} cols={4} />
    </LoadingPage>
  )
}
