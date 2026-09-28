import { icsForToken } from '@/server/booking/public'
import { buildIcs } from '@/lib/calendar-links'
import { appUrl } from '@/server/env'
import { jsonError } from '@/server/http'

export async function GET(_req: Request, ctx: RouteContext<'/manage/[token]/ics'>) {
  try {
    const { token } = await ctx.params
    const { appt, business, serviceName } = await icsForToken(token)
    const ics = buildIcs({
      uid: `${appt.id}@hournook`,
      title: `${serviceName} — ${business.name}`,
      start: appt.startsAt,
      end: appt.endsAt,
      location: [business.addressLine1, business.addressLine2, business.city]
        .filter(Boolean)
        .join(', '),
      details: `Reference ${appt.reference}. Manage your booking: ${appUrl(`/manage/${token}`)}`,
      status:
        appt.status === 'cancelled'
          ? 'CANCELLED'
          : appt.status === 'pending'
            ? 'TENTATIVE'
            : 'CONFIRMED',
      sequence: appt.rescheduleCount,
    })
    return new Response(ics, {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': `attachment; filename="appointment-${appt.reference}.ics"`,
        'cache-control': 'private, no-store',
        'referrer-policy': 'no-referrer',
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}
