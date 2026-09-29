import { after, NextResponse } from 'next/server'
import { publicBookingSchema } from '@/lib/validation/booking'
import { BOOKING_LOCALE_COOKIE, isLocale, type Locale } from '@/lib/i18n/config'
import { createPublicBooking } from '@/server/booking/public'
import { dispatchForAppointment } from '@/server/notifications/dispatcher'
import { assertSameOrigin, forbiddenOrigin, jsonError, metaFrom, readJson } from '@/server/http'
import { logger } from '@/server/observability/logger'

/**
 * The language the customer booked in: the booking page sends the language it
 * is shown in. API routes skip the proxy, so a page language chosen with
 * ?lang is otherwise only known from its cookie. Without either, the booking
 * takes the business's booking-page language.
 */
function bookingLocale(req: Request, body: unknown): Locale | null {
  const sent = (body as { locale?: unknown } | null)?.locale
  if (isLocale(sent)) return sent
  const cookie = req.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim().split('='))
    .find(([name]) => name === BOOKING_LOCALE_COOKIE)?.[1]
  return isLocale(cookie) ? cookie : null
}

export async function POST(req: Request, ctx: RouteContext<'/api/public/[slug]/bookings'>) {
  const meta = metaFrom(req)
  if (!assertSameOrigin(req)) return forbiddenOrigin()
  try {
    const { slug } = await ctx.params
    const body = await readJson(req)
    const input = publicBookingSchema.parse(body)
    const result = await createPublicBooking(slug, input, meta, bookingLocale(req, body))
    // Send confirmation emails right after responding; the cron dispatcher
    // retries anything that fails, so the booking never waits on email.
    after(() =>
      dispatchForAppointment(result.appointmentId).catch((err) =>
        logger.warn('dispatch.after_failed', { err }),
      ),
    )
    return NextResponse.json({ ok: true, data: result }, { status: 201 })
  } catch (err) {
    return jsonError(err, meta.requestId)
  }
}
