import { after, NextResponse } from 'next/server'
import { publicBookingSchema } from '@/lib/validation/booking'
import { createPublicBooking } from '@/server/booking/public'
import { dispatchForAppointment } from '@/server/notifications/dispatcher'
import { assertSameOrigin, forbiddenOrigin, jsonError, metaFrom, readJson } from '@/server/http'
import { logger } from '@/server/observability/logger'

export async function POST(req: Request, ctx: RouteContext<'/api/public/[slug]/bookings'>) {
  const meta = metaFrom(req)
  if (!assertSameOrigin(req)) return forbiddenOrigin()
  try {
    const { slug } = await ctx.params
    const input = publicBookingSchema.parse(await readJson(req))
    const result = await createPublicBooking(slug, input, meta)
    // Send confirmation emails right after responding; the cron dispatcher
    // retries anything that fails, so the booking never waits on email.
    after(() => dispatchForAppointment(result.appointmentId).catch((err) => logger.warn('dispatch.after_failed', { err })))
    return NextResponse.json({ ok: true, data: result }, { status: 201 })
  } catch (err) {
    return jsonError(err, meta.requestId)
  }
}
