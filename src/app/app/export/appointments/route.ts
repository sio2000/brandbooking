import { requireTenantAction } from '@/server/tenancy/context'
import { exportAppointmentsCsv } from '@/server/business/exports'
import { jsonError, metaFrom } from '@/server/http'
import { localToDate, todayIn, addDays, isPlainDate } from '@/lib/tz'

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantAction(['appointments.view_all', 'customers.export'])
    const url = new URL(req.url)
    const tz = ctx.business.timezone
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const f = from && isPlainDate(from) ? from : addDays(todayIn(tz), -365)
    const t = to && isPlainDate(to) ? to : addDays(todayIn(tz), 365)
    const csv = await exportAppointmentsCsv(ctx, { from: localToDate(f, 0, tz), to: localToDate(addDays(t, 1), 0, tz) }, metaFrom(req))
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="appointments-${f}-to-${t}.csv"`, 'cache-control': 'private, no-store' } })
  } catch (err) {
    return jsonError(err)
  }
}
