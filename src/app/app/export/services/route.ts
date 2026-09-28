import { requireTenantAction } from '@/server/tenancy/context'
import { exportServicesCsv } from '@/server/business/exports'
import { jsonError } from '@/server/http'

export async function GET() {
  try {
    const ctx = await requireTenantAction('services.manage')
    return new Response(await exportServicesCsv(ctx), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="services.csv"',
        'cache-control': 'private, no-store',
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}
