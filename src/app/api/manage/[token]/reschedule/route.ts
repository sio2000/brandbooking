import { after, NextResponse } from 'next/server'
import { z } from 'zod'
import { rescheduleManagedBooking } from '@/server/booking/public'
import { parseManageToken } from '@/server/booking/manage-token'
import { dispatchForAppointment } from '@/server/notifications/dispatcher'
import { assertSameOrigin, forbiddenOrigin, jsonError, metaFrom, readJson } from '@/server/http'

const body = z.object({ start: z.iso.datetime({ offset: true }) })

export async function POST(req: Request, ctx: RouteContext<'/api/manage/[token]/reschedule'>) {
  const meta = metaFrom(req)
  if (!assertSameOrigin(req)) return forbiddenOrigin()
  try {
    const { token } = await ctx.params
    const { start } = body.parse(await readJson(req))
    const data = await rescheduleManagedBooking(token, new Date(start), meta)
    const id = parseManageToken(token)?.appointmentId
    if (id) after(() => dispatchForAppointment(id).catch(() => {}))
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return jsonError(err, meta.requestId)
  }
}
