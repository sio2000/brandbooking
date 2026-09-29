import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import {
  appointments,
  businesses,
  customers,
  services,
  staff,
  type Appointment,
  type Business,
} from '@/server/db/schema'
import { appUrl } from '@/server/env'
import { signManageToken } from '@/server/booking/manage-token'
import { assetUrl } from '@/server/storage/images'
import {
  formatDateLong,
  formatDuration,
  formatMoney,
  formatTime,
  formatTimeZoneName,
} from '@/lib/format'
import type { Locale } from '@/lib/i18n/config'
import { translator } from '@/lib/i18n/load'
import { asLocale, bookingFormatLocale } from '@/lib/booking-locale'
import { renderEmail, type EmailBlock } from './layout'
import type { EmailMessage } from './providers'
import type { TemplateId } from './outbox'
import { accountLocale, emailLang } from './i18n'
import { googleCalendarUrl, outlookCalendarUrl } from '@/lib/calendar-links'

/**
 * Renders outbox rows into emails from *current* database state, so a
 * reminder always shows the latest time and a cancelled booking never gets a
 * reminder. Returns { skip } when the email no longer makes sense.
 *
 * Language: emails to the customer use the language they booked in
 * (`appointments.locale`); emails to team members use the recipient's account
 * language (`users.locale`). Both are read at send time, so queued emails
 * (reminders) are rendered in the right language. Dates and times use the
 * business's time zone. Business-written text (service names, the custom
 * email footer, the booking policy) is shown as written.
 */

export type RenderResult = { message: EmailMessage } | { skip: string }

type Loaded = {
  appt: Appointment
  business: Business
  serviceName: string
  staffName: string
  customer: { firstName: string; lastName: string; email: string | null; phone: string | null }
}

/** Everything an email in one language needs. */
type Lang = {
  locale: Locale
  /** Intl locale for dates, times, durations and prices. */
  fmt: string
  t: Awaited<ReturnType<typeof translator<'email-booking'>>>
  common: Awaited<ReturnType<typeof translator<'email'>>>
}

async function lang(locale: Locale): Promise<Lang> {
  const [t, common] = await Promise.all([
    translator(locale, 'email-booking'),
    translator(locale, 'email'),
  ])
  return { locale, fmt: bookingFormatLocale(locale), t, common }
}

async function load(appointmentId: string): Promise<Loaded | null> {
  const rows = await db()
    .select({
      appt: appointments,
      business: businesses,
      serviceName: services.name,
      staffName: staff.name,
      customer: {
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        phone: customers.phone,
      },
    })
    .from(appointments)
    .innerJoin(businesses, eq(businesses.id, appointments.businessId))
    .innerJoin(
      services,
      and(
        eq(services.id, appointments.serviceId),
        eq(services.businessId, appointments.businessId),
      ),
    )
    .innerJoin(
      staff,
      and(eq(staff.id, appointments.staffId), eq(staff.businessId, appointments.businessId)),
    )
    .innerJoin(
      customers,
      and(
        eq(customers.id, appointments.customerId),
        eq(customers.businessId, appointments.businessId),
      ),
    )
    .where(eq(appointments.id, appointmentId))
    .limit(1)
  return rows[0] ?? null
}

function whenRows(
  a: Pick<Appointment, 'startsAt' | 'endsAt' | 'timezone'>,
  l: Lang,
): Array<[string, string]> {
  return [
    [l.common('rows.date'), formatDateLong(a.startsAt, a.timezone, l.fmt)],
    [
      l.common('rows.time'),
      `${formatTime(a.startsAt, a.timezone, l.fmt)} – ${formatTime(a.endsAt, a.timezone, l.fmt)} (${formatTimeZoneName(a.startsAt, a.timezone, l.fmt)})`,
    ],
  ]
}

function address(b: Business) {
  return [b.addressLine1, b.addressLine2, [b.postalCode, b.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')
}

function detailRows(
  d: Loaded,
  l: Lang,
  opts: { includeCustomer?: boolean } = {},
): Array<[string, string]> {
  const { appt: a, business: b } = d
  const c = l.common
  const rows: Array<[string, string]> = [
    [c('rows.service'), `${d.serviceName} · ${formatDuration(a.durationMinutes, l.fmt)}`],
    ...whenRows(a, l),
    [c('rows.with'), d.staffName],
  ]
  if (a.priceCents != null)
    rows.push([c('rows.price'), formatMoney(a.priceCents, a.currency, l.fmt)])
  const addr = address(b)
  if (addr) rows.push([c('rows.where'), addr])
  if (opts.includeCustomer) {
    rows.push([c('rows.customer'), `${d.customer.firstName} ${d.customer.lastName}`.trim()])
    if (d.customer.email) rows.push([c('rows.email'), d.customer.email])
    if (d.customer.phone) rows.push([c('rows.phone'), d.customer.phone])
  }
  rows.push([c('rows.reference'), a.reference])
  return rows
}

function manageUrl(a: Appointment) {
  return appUrl(`/manage/${signManageToken(a.id, a.manageNonce)}`)
}

function calendarLinks(d: Loaded, l: Lang) {
  const a = d.appt
  const c = l.common
  const ev = {
    title: c('calendar.title', { service: d.serviceName, business: d.business.name }),
    start: a.startsAt,
    end: a.endsAt,
    location: address(d.business),
    details: c('calendar.manage', { url: manageUrl(a) }),
  }
  return [
    { label: c('calendar.google'), url: googleCalendarUrl(ev) },
    { label: c('calendar.outlook'), url: outlookCalendarUrl(ev) },
    {
      label: c('calendar.apple'),
      url: appUrl(`/manage/${signManageToken(a.id, a.manageNonce)}/ics`),
    },
  ]
}

async function customerEmail(
  d: Loaded,
  l: Lang,
  subject: string,
  preheader: string,
  blocks: EmailBlock[],
): Promise<EmailMessage> {
  const b = d.business
  const logoUrl = await assetUrl(b.id, b.logoAssetId, 'sm')
  const { html, text } = renderEmail({
    preheader,
    brandName: b.name,
    brandColor: b.brandColor,
    logoUrl,
    blocks,
    footer: [
      b.emailFooter || l.common('footerDefault'),
      l.common('sentOnBehalf', { business: b.name }),
    ].join(' '),
    previousLabel: l.common('previous'),
    ...emailLang(l.locale),
  })
  return {
    to: d.customer.email!,
    subject,
    html,
    text,
    fromName: b.emailSenderName || b.name,
    replyTo: b.email ?? undefined,
  }
}

function memberEmail(
  d: Loaded,
  l: Lang,
  to: string,
  subject: string,
  blocks: EmailBlock[],
): EmailMessage {
  const { html, text } = renderEmail({
    preheader: subject,
    brandName: 'Hournook',
    blocks,
    footer: l.t('member.footer', { business: d.business.name }),
    previousLabel: l.common('previous'),
    ...emailLang(l.locale),
  })
  return { to, subject, html, text }
}

export async function renderBookingEmail(
  template: TemplateId,
  appointmentId: string,
  recipient: string,
  payload: Record<string, unknown>,
): Promise<RenderResult> {
  const d = await load(appointmentId)
  if (!d) return { skip: 'appointment_missing' }
  const { appt: a, business: b } = d
  const first = d.customer.firstName
  const policy = b.bookingPolicy
    ? [{ type: 'text', muted: true, text: b.bookingPolicy } as EmailBlock]
    : []
  const manage = manageUrl(a)
  const isCustomerTemplate = template.startsWith('booking_')
  if (
    isCustomerTemplate &&
    (!d.customer.email || d.customer.email.toLowerCase() !== recipient.toLowerCase())
  ) {
    return { skip: 'recipient_changed' }
  }
  const l = await lang(
    isCustomerTemplate ? asLocale(a.locale) : await accountLocale(recipient, b.locale),
  )
  const { t } = l
  const date = formatDateLong(a.startsAt, a.timezone, l.fmt)
  const vars = { business: b.name, service: d.serviceName, name: first, date }
  const manageButton: EmailBlock = { type: 'button', label: l.common('manageCta'), url: manage }

  switch (template) {
    case 'booking_received': {
      const pending = a.status === 'pending'
      if (a.status === 'cancelled') return { skip: 'cancelled' }
      return {
        message: await customerEmail(
          d,
          l,
          pending ? t('received.subjectPending', vars) : t('received.subject', vars),
          pending ? t('received.preheaderPending', vars) : t('received.preheader', vars),
          [
            {
              type: 'heading',
              text: pending ? t('received.headingPending', vars) : t('received.heading', vars),
            },
            {
              type: 'text',
              text: pending ? t('received.bodyPending', vars) : t('received.body', vars),
            },
            { type: 'details', rows: detailRows(d, l) },
            manageButton,
            ...(pending ? [] : [{ type: 'links', links: calendarLinks(d, l) } as EmailBlock]),
            ...policy,
          ],
        ),
      }
    }
    case 'booking_confirmed': {
      if (a.status !== 'confirmed') return { skip: 'not_confirmed' }
      return {
        message: await customerEmail(
          d,
          l,
          t('confirmed.subject', vars),
          t('confirmed.preheader', vars),
          [
            { type: 'heading', text: t('confirmed.heading', vars) },
            { type: 'text', text: t('confirmed.body', vars) },
            { type: 'details', rows: detailRows(d, l) },
            manageButton,
            { type: 'links', links: calendarLinks(d, l) },
            ...policy,
          ],
        ),
      }
    }
    case 'booking_reminder': {
      if (a.status !== 'confirmed') return { skip: 'not_confirmed' }
      if (String(payload.startsAt) !== a.startsAt.toISOString()) return { skip: 'rescheduled' }
      if (a.startsAt.getTime() < Date.now()) return { skip: 'in_past' }
      return {
        message: await customerEmail(
          d,
          l,
          t('reminder.subject', { ...vars, time: formatTime(a.startsAt, a.timezone, l.fmt) }),
          t('reminder.preheader', vars),
          [
            { type: 'heading', text: t('reminder.heading', vars) },
            { type: 'text', text: t('reminder.body', vars) },
            { type: 'details', rows: detailRows(d, l) },
            manageButton,
            ...policy,
          ],
        ),
      }
    }
    case 'booking_rescheduled': {
      if (a.status === 'cancelled') return { skip: 'cancelled' }
      const prev =
        typeof payload.previousStartsAt === 'string' ? new Date(payload.previousStartsAt) : null
      const prevEnd = prev
        ? new Date(prev.getTime() + (a.endsAt.getTime() - a.startsAt.getTime()))
        : null
      return {
        message: await customerEmail(
          d,
          l,
          t('rescheduled.subject', vars),
          t('rescheduled.preheader', vars),
          [
            { type: 'heading', text: t('rescheduled.heading', vars) },
            { type: 'text', text: t('rescheduled.body', vars) },
            ...(prev && prevEnd
              ? [
                  { type: 'text', muted: true, text: t('rescheduled.previousTime') } as EmailBlock,
                  {
                    type: 'details',
                    strike: true,
                    rows: whenRows({ startsAt: prev, endsAt: prevEnd, timezone: a.timezone }, l),
                  } as EmailBlock,
                ]
              : []),
            { type: 'text', muted: true, text: t('rescheduled.newTime') },
            { type: 'details', rows: detailRows(d, l) },
            manageButton,
            { type: 'links', links: calendarLinks(d, l) },
          ],
        ),
      }
    }
    case 'booking_cancelled': {
      if (a.status !== 'cancelled') return { skip: 'not_cancelled' }
      const byCustomer = payload.by === 'customer'
      return {
        message: await customerEmail(
          d,
          l,
          t('cancelled.subject', vars),
          t('cancelled.preheader', vars),
          [
            { type: 'heading', text: t('cancelled.heading', vars) },
            {
              type: 'text',
              text: byCustomer ? t('cancelled.byCustomer', vars) : t('cancelled.byBusiness', vars),
            },
            { type: 'details', strike: true, rows: detailRows(d, l) },
            ...(a.cancellationReason && !byCustomer
              ? [
                  {
                    type: 'notice',
                    text: t('cancelled.message', {
                      business: b.name,
                      reason: a.cancellationReason,
                    }),
                  } as EmailBlock,
                ]
              : []),
            ...(b.publishStatus === 'published'
              ? [
                  {
                    type: 'button',
                    label: t('cancelled.bookAgain'),
                    url: appUrl(`/book/${b.slug}`),
                  } as EmailBlock,
                ]
              : []),
          ],
        ),
      }
    }
    case 'member_booking_created':
    case 'member_booking_cancelled':
    case 'member_booking_rescheduled': {
      const who = `${d.customer.firstName} ${d.customer.lastName}`.trim()
      const mv = { customer: who, service: d.serviceName, date }
      const title =
        template === 'member_booking_created'
          ? a.status === 'pending'
            ? t('member.createdPendingTitle', mv)
            : t('member.createdTitle', mv)
          : template === 'member_booking_cancelled'
            ? t('member.cancelledTitle', mv)
            : t('member.rescheduledTitle', mv)
      const intro =
        template === 'member_booking_created'
          ? a.status === 'pending'
            ? t('member.createdPendingIntro', mv)
            : t('member.createdIntro', mv)
          : template === 'member_booking_cancelled'
            ? t('member.cancelledIntro', mv)
            : t('member.rescheduledIntro', mv)
      return {
        message: memberEmail(d, l, recipient, title, [
          { type: 'heading', text: title },
          { type: 'text', text: intro },
          {
            type: 'details',
            rows: detailRows(d, l, { includeCustomer: true }),
            strike: template === 'member_booking_cancelled',
          },
          ...(a.customerMessage
            ? [
                {
                  type: 'notice',
                  text: t('member.note', { message: a.customerMessage }),
                } as EmailBlock,
              ]
            : []),
          {
            type: 'button',
            label: t('member.open'),
            url: appUrl(`/app/appointments/${a.id}`),
          },
        ]),
      }
    }
    default:
      return { skip: 'unknown_template' }
  }
}
