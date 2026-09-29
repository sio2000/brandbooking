import { icsForToken } from '@/server/booking/public'
import { buildIcs } from '@/lib/calendar-links'
import { appUrl } from '@/server/env'
import { jsonError } from '@/server/http'
import { getT } from '@/server/i18n'
import { BOOKING_LOCALE_COOKIE, LOCALE_META, isLocale } from '@/lib/i18n/config'
import { asLocale } from '@/lib/booking-locale'

export async function GET(req: Request, ctx: RouteContext<'/manage/[token]/ics'>) {
  try {
    const { token } = await ctx.params
    const { appt, business, serviceName } = await icsForToken(token)
    // The manage page's language: ?lang or the customer's choice, else the language they booked in.
    const asked = new URL(req.url).searchParams.get('lang')
    const remembered = req.headers
      .get('cookie')
      ?.split(';')
      .map((c) => c.trim().split('='))
      .find(([name]) => name === BOOKING_LOCALE_COOKIE)?.[1]
    const locale = isLocale(asked)
      ? asked
      : isLocale(remembered)
        ? remembered
        : asLocale(appt.locale)
    const t = await getT('email', locale)
    const ics = buildIcs({
      uid: `${appt.id}@hournook`,
      title: t('calendar.title', {
        service: serviceName ?? t('calendar.appointment'),
        business: business.name,
      }),
      start: appt.startsAt,
      end: appt.endsAt,
      location: [business.addressLine1, business.addressLine2, business.city]
        .filter(Boolean)
        .join(', '),
      details: t('calendar.referenceAndManage', {
        reference: appt.reference,
        url: appUrl(`/manage/${token}`),
      }),
      language: locale === 'en' ? undefined : LOCALE_META[locale].tag,
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
