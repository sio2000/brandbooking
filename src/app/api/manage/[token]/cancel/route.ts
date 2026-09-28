import { after, NextResponse } from 'next/server'
import { z } from 'zod'
import { cancelManagedBooking } from '@/server/booking/public'
import { parseManageToken } from '@/server/booking/manage-token'
import { dispatchForAppointment } from '@/server/notifications/dispatcher'
import { assertSameOrigin, forbiddenOrigin, jsonError, metaFrom, readJson } from '@/server/http'

const body = z.object({ reason: z.string().trim().max(500).nullish() })

export async function POST(req: Request, ctx: RouteContext<'/api/manage/[token]/cancel'>) {
  const meta = metaFrom(req)
  if (!assertSameOrigin(req)) return forbiddenOrigin()
  try {
    const { token } = await ctx.params
    const { reason } = body.parse(await readJson(req))
    await cancelManagedBooking(token, reason ?? null, meta)
    const id = parseManageToken(token)?.appointmentId
    if (id) after(() => dispatchForAppointment(id).catch(() => {}))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return jsonError(err, meta.requestId)
  }
}
