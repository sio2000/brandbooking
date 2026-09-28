import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { appointments, businesses, customers, services, staff, type Appointment, type Business } from '@/server/db/schema'
import { appUrl } from '@/server/env'
import { signManageToken } from '@/server/booking/manage-token'
import { assetUrl } from '@/server/storage/images'
import { formatDateLong, formatDuration, formatMoney, formatTime, formatTimeZoneName } from '@/lib/format'
import { messages } from '@/lib/i18n/messages'
import { renderEmail, type EmailBlock } from './layout'
import type { EmailMessage } from './providers'
import type { TemplateId } from './outbox'
import { googleCalendarUrl, outlookCalendarUrl } from '@/lib/calendar-links'

/**
 * Renders outbox rows into emails from *current* database state, so a
 * reminder always shows the latest time and a cancelled booking never gets a
 * reminder. Returns { skip } when the email no longer makes sense.
 */

export type RenderResult = { message: EmailMessage } | { skip: string }

type Loaded = {
  appt: Appointment
  business: Business
  serviceName: string
  staffName: string
  customer: { firstName: string; lastName: string; email: string | null; phone: string | null }
}

async function load(appointmentId: string): Promise<Loaded | null> {
  const rows = await db()
    .select({
      appt: appointments,
      business: businesses,
      serviceName: services.name,
      staffName: staff.name,
      customer: { firstName: customers.firstName, lastName: customers.lastName, email: customers.email, phone: customers.phone },
    })
    .from(appointments)
    .innerJoin(businesses, eq(businesses.id, appointments.businessId))
    .innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, appointments.businessId)))
    .innerJoin(staff, and(eq(staff.id, appointments.staffId), eq(staff.businessId, appointments.businessId)))
    .innerJoin(customers, and(eq(customers.id, appointments.customerId), eq(customers.businessId, appointments.businessId)))
    .where(eq(appointments.id, appointmentId))
    .limit(1)
  return rows[0] ?? null
}

function whenRows(a: Pick<Appointment, 'startsAt' | 'endsAt' | 'timezone'>, locale: string): Array<[string, string]> {
  return [
    ['Date', formatDateLong(a.startsAt, a.timezone, locale)],
    ['Time', `${formatTime(a.startsAt, a.timezone, locale)} – ${formatTime(a.endsAt, a.timezone, locale)} (${formatTimeZoneName(a.startsAt, a.timezone, locale)})`],
  ]
}

function address(b: Business) {
  return [b.addressLine1, b.addressLine2, [b.postalCode, b.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

function detailRows(d: Loaded, opts: { includeCustomer?: boolean } = {}): Array<[string, string]> {
  const { appt: a, business: b } = d
  const rows: Array<[string, string]> = [
    ['Service', `${d.serviceName} · ${formatDuration(a.durationMinutes)}`],
    ...whenRows(a, b.locale),
    ['With', d.staffName],
  ]
  if (a.priceCents != null) rows.push(['Price', formatMoney(a.priceCents, a.currency, b.locale)])
  const addr = address(b)
  if (addr) rows.push(['Where', addr])
  if (opts.includeCustomer) {
    rows.push(['Customer', `${d.customer.firstName} ${d.customer.lastName}`.trim()])
    if (d.customer.email) rows.push(['Email', d.customer.email])
    if (d.customer.phone) rows.push(['Phone', d.customer.phone])
  }
  rows.push(['Reference', a.reference])
  return rows
}

function manageUrl(a: Appointment) {
  return appUrl(`/manage/${signManageToken(a.id, a.manageNonce)}`)
}

function calendarLinks(d: Loaded) {
  const a = d.appt
  const ev = {
    title: `${d.serviceName} — ${d.business.name}`,
    start: a.startsAt,
    end: a.endsAt,
    location: address(d.business),
    details: `Manage your booking: ${manageUrl(a)}`,
  }
  return [
    { label: 'Google Calendar', url: googleCalendarUrl(ev) },
    { label: 'Outlook', url: outlookCalendarUrl(ev) },
    { label: 'Apple / .ics', url: appUrl(`/manage/${signManageToken(a.id, a.manageNonce)}/ics`) },
  ]
}

async function customerEmail(d: Loaded, subject: string, preheader: string, blocks: EmailBlock[]): Promise<EmailMessage> {
  const b = d.business
  const logoUrl = await assetUrl(b.id, b.logoAssetId, 'sm')
  const { html, text } = renderEmail({
    preheader,
    brandName: b.name,
    brandColor: b.brandColor,
    logoUrl,
    blocks,
    footer: [b.emailFooter || messages.email.footerDefault, `Sent by Hournook on behalf of ${b.name}.`].join(' '),
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

function memberEmail(d: Loaded, to: string, subject: string, blocks: EmailBlock[]): EmailMessage {
  const { html, text } = renderEmail({
    preheader: subject,
    brandName: 'Hournook',
    blocks,
    footer: `You're receiving this because you're a member of ${d.business.name} on Hournook. Change notification preferences in Settings.`,
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
  const policy = b.bookingPolicy ? [{ type: 'text', muted: true, text: b.bookingPolicy } as EmailBlock] : []
  const manage = manageUrl(a)
  const isCustomerTemplate = template.startsWith('booking_')
  if (isCustomerTemplate && (!d.customer.email || d.customer.email.toLowerCase() !== recipient.toLowerCase())) {
    return { skip: 'recipient_changed' }
  }

  switch (template) {
    case 'booking_received': {
      const pending = a.status === 'pending'
      if (a.status === 'cancelled') return { skip: 'cancelled' }
      return {
        message: await customerEmail(
          d,
          pending ? `Booking request received — ${b.name}` : `Booking confirmed — ${d.serviceName} on ${formatDateLong(a.startsAt, a.timezone, b.locale)}`,
          pending ? `${b.name} will confirm your request shortly.` : `See you on ${formatDateLong(a.startsAt, a.timezone, b.locale)}.`,
          [
            { type: 'heading', text: pending ? `Thanks, ${first} — request received` : `You're booked, ${first}!` },
            {
              type: 'text',
              text: pending
                ? `${b.name} will review your request and confirm it shortly. You'll get another email once it's confirmed.`
                : `Your appointment with ${b.name} is confirmed. Here are the details:`,
            },
            { type: 'details', rows: detailRows(d) },
            { type: 'button', label: messages.email.manageCta, url: manage },
            ...(pending ? [] : [{ type: 'links', links: calendarLinks(d) } as EmailBlock]),
            ...policy,
          ],
        ),
      }
    }
    case 'booking_confirmed': {
      if (a.status !== 'confirmed') return { skip: 'not_confirmed' }
      return {
        message: await customerEmail(d, `Confirmed — ${d.serviceName} on ${formatDateLong(a.startsAt, a.timezone, b.locale)}`, `${b.name} confirmed your booking.`, [
          { type: 'heading', text: 'Your booking is confirmed' },
          { type: 'text', text: `Good news, ${first} — ${b.name} has confirmed your appointment.` },
          { type: 'details', rows: detailRows(d) },
          { type: 'button', label: messages.email.manageCta, url: manage },
          { type: 'links', links: calendarLinks(d) },
          ...policy,
        ]),
      }
    }
    case 'booking_reminder': {
      if (a.status !== 'confirmed') return { skip: 'not_confirmed' }
      if (String(payload.startsAt) !== a.startsAt.toISOString()) return { skip: 'rescheduled' }
      if (a.startsAt.getTime() < Date.now()) return { skip: 'in_past' }
      return {
        message: await customerEmail(d, `Reminder: ${d.serviceName} ${formatDateLong(a.startsAt, a.timezone, b.locale)} at ${formatTime(a.startsAt, a.timezone, b.locale)}`, `Your appointment with ${b.name} is coming up.`, [
          { type: 'heading', text: 'See you soon' },
          { type: 'text', text: `Hi ${first}, this is a friendly reminder of your upcoming appointment with ${b.name}.` },
          { type: 'details', rows: detailRows(d) },
          { type: 'button', label: messages.email.manageCta, url: manage },
          ...policy,
        ]),
      }
    }
    case 'booking_rescheduled': {
      if (a.status === 'cancelled') return { skip: 'cancelled' }
      const prev = typeof payload.previousStartsAt === 'string' ? new Date(payload.previousStartsAt) : null
      const prevEnd = prev ? new Date(prev.getTime() + (a.endsAt.getTime() - a.startsAt.getTime())) : null
      return {
        message: await customerEmail(d, `Rescheduled — ${d.serviceName} now ${formatDateLong(a.startsAt, a.timezone, b.locale)}`, 'Your appointment has a new time.', [
          { type: 'heading', text: 'Your appointment has moved' },
          { type: 'text', text: `Hi ${first}, your appointment with ${b.name} has been rescheduled.` },
          ...(prev && prevEnd
            ? [
                { type: 'text', muted: true, text: 'Previous time' } as EmailBlock,
                { type: 'details', strike: true, rows: whenRows({ startsAt: prev, endsAt: prevEnd, timezone: a.timezone }, b.locale) } as EmailBlock,
              ]
            : []),
          { type: 'text', muted: true, text: 'New time' },
          { type: 'details', rows: detailRows(d) },
          { type: 'button', label: messages.email.manageCta, url: manage },
          { type: 'links', links: calendarLinks(d) },
        ]),
      }
    }
    case 'booking_cancelled': {
      if (a.status !== 'cancelled') return { skip: 'not_cancelled' }
      const byCustomer = payload.by === 'customer'
      return {
        message: await customerEmail(d, `Cancelled — ${d.serviceName} on ${formatDateLong(a.startsAt, a.timezone, b.locale)}`, 'Your appointment has been cancelled.', [
          { type: 'heading', text: 'Appointment cancelled' },
          {
            type: 'text',
            text: byCustomer
              ? `Hi ${first}, as requested we've cancelled your appointment with ${b.name}.`
              : `Hi ${first}, ${b.name} has cancelled your appointment. We're sorry for any inconvenience.`,
          },
          { type: 'details', strike: true, rows: detailRows(d) },
          ...(a.cancellationReason && !byCustomer ? [{ type: 'notice', text: `Message from ${b.name}: ${a.cancellationReason}` } as EmailBlock] : []),
          ...(b.publishStatus === 'published' ? [{ type: 'button', label: 'Book a new time', url: appUrl(`/book/${b.slug}`) } as EmailBlock] : []),
        ]),
      }
    }
    case 'member_booking_created':
    case 'member_booking_cancelled':
    case 'member_booking_rescheduled': {
      const who = `${d.customer.firstName} ${d.customer.lastName}`.trim()
      const title =
        template === 'member_booking_created'
          ? a.status === 'pending'
            ? `New booking request: ${who}`
            : `New booking: ${who}`
          : template === 'member_booking_cancelled'
            ? `Cancelled: ${who}, ${formatDateLong(a.startsAt, a.timezone, b.locale)}`
            : `Rescheduled: ${who}`
      const intro =
        template === 'member_booking_created'
          ? a.status === 'pending'
            ? `${who} requested ${d.serviceName}. Confirm or decline it in your dashboard.`
            : `${who} booked ${d.serviceName}.`
          : template === 'member_booking_cancelled'
            ? `${who} cancelled their appointment. The time is available again.`
            : `${who} moved their appointment to a new time.`
      return {
        message: memberEmail(d, recipient, title, [
          { type: 'heading', text: title },
          { type: 'text', text: intro },
          { type: 'details', rows: detailRows(d, { includeCustomer: true }), strike: template === 'member_booking_cancelled' },
          ...(a.customerMessage ? [{ type: 'notice', text: `Note from customer: ${a.customerMessage}` } as EmailBlock] : []),
          { type: 'button', label: 'Open in Hournook', url: appUrl(`/app/appointments/${a.id}`) },
        ]),
      }
    }
    default:
      return { skip: 'unknown_template' }
  }
}
