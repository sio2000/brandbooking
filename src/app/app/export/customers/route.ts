import { requireTenantAction } from '@/server/tenancy/context'
import { exportCustomersCsv } from '@/server/business/exports'
import { SEGMENTS, type Segment } from '@/server/business/customers-admin'
import { jsonError, metaFrom } from '@/server/http'

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantAction('customers.export')
    const s = new URL(req.url).searchParams.get('segment') ?? 'all'
    const segment = (SEGMENTS as readonly string[]).includes(s) ? (s as Segment) : 'all'
    const csv = await exportCustomersCsv(ctx, segment, metaFrom(req))
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="customers-${segment}.csv"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}
