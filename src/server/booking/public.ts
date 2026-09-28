import 'server-only'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/server/db/client'
import {
  appointments,
  businesses,
  customers,
  serviceCategories,
  services,
  staff,
  staffServices,
  type Business,
} from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { accessFor } from '@/server/billing/service'
import { assetUrl, assetUrls } from '@/server/storage/images'
import { enforceRateLimits, POLICIES } from '@/server/security/rate-limit'
import type { RequestMeta } from '@/server/request'
import { deriveSource, type PublicBookingInput } from '@/lib/validation/booking'
import { addDays, addMonths, endOfMonth, isPlainDate, todayIn } from '@/lib/tz'
import {
  bookAppointment,
  cancelAppointment,
  getAvailability,
  rescheduleAppointment,
} from './booking-service'
import { getOrCreateRules } from './loader'
import {
  LINK_VALID_AFTER_END_MS,
  parseManageToken,
  signManageToken,
  verifyManageToken,
} from './manage-token'
import { customerCanCancel, customerCanReschedule, deadlineFor } from './transitions'

/**
 * Public (unauthenticated) booking surface. Only intentionally public data is
 * returned: no internal notes, no other customers, no staff emails.
 */

export type PublicAvailabilityState =
  | { accepting: true }
  | { accepting: false; reason: 'paused' | 'unavailable'; message?: string | null }

export async function findPublicBusiness(slug: string): Promise<Business | null> {
  if (!/^[a-z0-9-]{3,48}$/i.test(slug)) return null
  const [b] = await db()
    .select()
    .from(businesses)
    .where(and(eq(businesses.slug, slug.toLowerCase()), isNull(businesses.deletedAt)))
    .limit(1)
  return b ?? null
}

export function isPubliclyVisible(b: Business) {
  return b.status === 'active' && (b.publishStatus === 'published' || b.publishStatus === 'paused')
}

export async function bookingState(
  b: Business,
  now = new Date(),
): Promise<PublicAvailabilityState> {
  if (b.status !== 'active') return { accepting: false, reason: 'unavailable' }
  if (
    b.publishStatus === 'paused' &&
    !(b.pausedUntil && b.pausedUntil.getTime() <= now.getTime())
  ) {
    return { accepting: false, reason: 'paused', message: b.pausedMessage }
  }
  if (b.publishStatus === 'draft') return { accepting: false, reason: 'unavailable' }
  const access = await accessFor(b, now)
  if (!access.canAcceptBookings) return { accepting: false, reason: 'paused' }
  return { accepting: true }
}

export async function getPublicPageData(b: Business) {
  const [rules, svcRows, cats, staffRows, links] = await Promise.all([
    getOrCreateRules(db(), b.id),
    db()
      .select()
      .from(services)
      .where(
        and(
          eq(services.businessId, b.id),
          eq(services.isActive, true),
          eq(services.isVisible, true),
          isNull(services.deletedAt),
        ),
      )
      .orderBy(asc(services.position), asc(services.name)),
    db()
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.businessId, b.id))
      .orderBy(asc(serviceCategories.position)),
    db()
      .select({
        id: staff.id,
        name: staff.name,
        title: staff.title,
        bio: staff.bio,
        avatarAssetId: staff.avatarAssetId,
        color: staff.color,
      })
      .from(staff)
      .where(and(eq(staff.businessId, b.id), eq(staff.isActive, true), isNull(staff.deletedAt)))
      .orderBy(asc(staff.position), asc(staff.name)),
    db()
      .select({ staffId: staffServices.staffId, serviceId: staffServices.serviceId })
      .from(staffServices)
      .where(eq(staffServices.businessId, b.id)),
  ])
  const activeStaff = new Set(staffRows.map((s) => s.id))
  const staffByService = new Map<string, string[]>()
  for (const l of links) {
    if (!activeStaff.has(l.staffId)) continue
    staffByService.set(l.serviceId, [...(staffByService.get(l.serviceId) ?? []), l.staffId])
  }
  const avatars = await assetUrls(
    b.id,
    staffRows.map((s) => s.avatarAssetId),
    'sm',
  )
  const [logoUrl, coverUrl] = await Promise.all([
    assetUrl(b.id, b.logoAssetId),
    assetUrl(b.id, b.coverAssetId),
  ])
  const bookableServices = svcRows.filter((s) => (staffByService.get(s.id)?.length ?? 0) > 0)
  return {
    business: {
      id: b.id,
      slug: b.slug,
      name: b.name,
      description: b.description,
      category: b.category,
      timezone: b.timezone,
      locale: b.locale,
      currency: b.currency,
      email: b.email,
      phone: b.phone,
      website: b.website,
      address: [
        b.addressLine1,
        b.addressLine2,
        [b.postalCode, b.city].filter(Boolean).join(' '),
      ].filter((x): x is string => Boolean(x)),
      country: b.country,
      socialLinks: b.socialLinks,
      brandColor: b.brandColor,
      bookingPolicy: b.bookingPolicy,
      logoUrl,
      coverUrl,
    },
    categories: cats.map((c) => ({ id: c.id, name: c.name })),
    services: bookableServices.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      priceCents: s.priceCents,
      categoryId: s.categoryId,
      color: s.color,
      staffIds: staffByService.get(s.id) ?? [],
    })),
    staff: b.showStaffOnPage
      ? staffRows.map((s) => ({
          id: s.id,
          name: s.name,
          title: s.title,
          bio: s.bio,
          avatarUrl: s.avatarAssetId ? (avatars.get(s.avatarAssetId) ?? null) : null,
          color: s.color,
        }))
      : [],
    rules: {
      staffSelection: b.showStaffOnPage ? rules.staffSelection : ('hidden' as const),
      phoneRequirement: rules.phoneRequirement,
      requiresConfirmation: rules.requiresConfirmation,
      allowCustomerCancel: rules.allowCustomerCancel,
      allowCustomerReschedule: rules.allowCustomerReschedule,
      cancellationDeadlineMinutes: rules.cancellationDeadlineMinutes,
      rescheduleDeadlineMinutes: rules.rescheduleDeadlineMinutes,
      maxAdvanceDays: rules.maxAdvanceDays,
    },
  }
}

export type PublicPageData = Awaited<ReturnType<typeof getPublicPageData>>

/** Explicit range, or by default today through the end of next month. */
function defaultRange(timeZone: string, q: { from?: string; to?: string }) {
  if (q.from && q.to) {
    if (!isPlainDate(q.from) || !isPlainDate(q.to)) throw new AppError('validation')
    return { from: q.from, to: q.to }
  }
  const today = todayIn(timeZone)
  return { from: today, to: endOfMonth(addMonths(today, 1)) }
}

async function requireAccepting(slug: string) {
  const b = await findPublicBusiness(slug)
  if (!b || !isPubliclyVisible(b)) throw new AppError('booking_page_unavailable')
  const state = await bookingState(b)
  if (!state.accepting)
    throw new AppError(state.reason === 'paused' ? 'bookings_paused' : 'booking_page_unavailable')
  return b
}

export async function publicAvailability(
  slug: string,
  q: { serviceId: string; staffId: string | null; from?: string; to?: string },
  meta: RequestMeta,
  /** Business the signed-in viewer may preview while it is unpublished. */
  previewBusinessId: string | null = null,
) {
  await enforceRateLimits([[`avail:ip:${meta.ip}`, POLICIES.availabilityByIp]])
  const found = await findPublicBusiness(slug)
  const previewing =
    !!found &&
    found.id === previewBusinessId &&
    found.status === 'active' &&
    !isPubliclyVisible(found)
  const b = previewing ? found : await requireAccepting(slug)
  const { from, to } = defaultRange(b.timezone, q)
  const rules = await getOrCreateRules(db(), b.id)
  const days = await getAvailability({
    business: b,
    serviceId: q.serviceId,
    staffId: q.staffId,
    from,
    to,
  })
  const exposeStaff = b.showStaffOnPage && rules.staffSelection !== 'hidden'
  return {
    timezone: b.timezone,
    today: todayIn(b.timezone),
    lastDate: addDays(todayIn(b.timezone), rules.maxAdvanceDays),
    days: days.map((d) => ({
      date: d.date,
      slots: d.slots.map((s) => ({
        start: new Date(s.start).toISOString(),
        ...(exposeStaff ? { staffIds: s.staffIds } : {}),
      })),
    })),
  }
}

export async function createPublicBooking(
  slug: string,
  input: PublicBookingInput,
  meta: RequestMeta,
) {
  const b = await requireAccepting(slug)
  await enforceRateLimits([
    [`book:ip:${meta.ip}`, POLICIES.bookingByIp],
    [`book:biz:${b.id}`, POLICIES.bookingByBusiness],
  ])
  const rules = await getOrCreateRules(db(), b.id)
  if (rules.phoneRequirement === 'required' && !input.phone) {
    throw new AppError('validation', { fields: { phone: 'Enter your phone number.' } })
  }
  if (rules.staffSelection === 'required' && !input.staffId && b.showStaffOnPage) {
    throw new AppError('validation', { fields: { staffId: 'Choose a team member.' } })
  }
  const staffId = rules.staffSelection === 'hidden' || !b.showStaffOnPage ? null : input.staffId
  const { appointment, manageNonce } = await bookAppointment({
    business: b,
    serviceId: input.serviceId,
    staffId,
    start: new Date(input.start),
    customer: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: rules.phoneRequirement === 'hidden' ? null : input.phone,
    },
    customerMessage: input.message,
    source: deriveSource(input),
    utm: { source: input.utmSource, medium: input.utmMedium, campaign: input.utmCampaign },
    referrerHost: input.referrerHost,
    actor: { type: 'customer', ip: meta.ip, requestId: meta.requestId },
    enforceAvailability: true,
  })
  return {
    appointmentId: appointment.id,
    reference: appointment.reference,
    status: appointment.status,
    manageToken: signManageToken(appointment.id, manageNonce),
  }
}

// ---------------------------------------------------------------------------
// Customer self-service via signed link
// ---------------------------------------------------------------------------

async function loadByToken(token: string) {
  const parsed = parseManageToken(token)
  if (!parsed) throw new AppError('token_invalid')
  const rows = await db()
    .select({ appt: appointments, business: businesses })
    .from(appointments)
    .innerJoin(businesses, eq(businesses.id, appointments.businessId))
    .where(eq(appointments.id, parsed.appointmentId))
    .limit(1)
  const row = rows[0]
  // Verify even when missing (against a dummy) to keep timing uniform.
  const ok = verifyManageToken(
    parsed.signature,
    parsed.appointmentId,
    row?.appt.manageNonce ?? 'x'.repeat(24),
  )
  if (!row || !ok) throw new AppError('token_invalid')
  if (row.business.deletedAt) throw new AppError('token_invalid')
  if (Date.now() > row.appt.endsAt.getTime() + LINK_VALID_AFTER_END_MS)
    throw new AppError('token_expired')
  return row
}

export async function getManagedBooking(token: string, meta: RequestMeta) {
  await enforceRateLimits([[`manage:ip:${meta.ip}`, POLICIES.manageByIp]])
  const { appt, business } = await loadByToken(token)
  const [details] = await db()
    .select({
      serviceName: services.name,
      serviceId: services.id,
      serviceActive: services.isActive,
      staffName: staff.name,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      phone: customers.phone,
    })
    .from(appointments)
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
    .where(eq(appointments.id, appt.id))
    .limit(1)
  const rules = await getOrCreateRules(db(), business.id)
  const now = new Date()
  const logoUrl = await assetUrl(business.id, business.logoAssetId, 'sm')
  const state = await bookingState(business, now)
  return {
    appointment: {
      reference: appt.reference,
      status: appt.status,
      startsAt: appt.startsAt.toISOString(),
      endsAt: appt.endsAt.toISOString(),
      timezone: appt.timezone,
      durationMinutes: appt.durationMinutes,
      priceCents: appt.priceCents,
      currency: appt.currency,
      serviceId: details!.serviceId,
      serviceName: details!.serviceName,
      staffName: details!.staffName,
      customer: {
        firstName: details!.firstName,
        lastName: details!.lastName,
        email: details!.email,
        phone: details!.phone,
      },
      customerMessage: appt.customerMessage,
    },
    business: {
      slug: business.slug,
      name: business.name,
      brandColor: business.brandColor,
      logoUrl,
      email: business.email,
      phone: business.phone,
      address: [
        business.addressLine1,
        business.addressLine2,
        [business.postalCode, business.city].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', '),
      bookingPolicy: business.bookingPolicy,
    },
    can: {
      cancel: customerCanCancel(appt.status, appt.startsAt, rules, now),
      reschedule:
        customerCanReschedule(appt.status, appt.startsAt, rules, now) &&
        details!.serviceActive &&
        state.accepting,
    },
    deadlines: {
      cancel: deadlineFor(appt.startsAt, rules.cancellationDeadlineMinutes).toISOString(),
      reschedule: deadlineFor(appt.startsAt, rules.rescheduleDeadlineMinutes).toISOString(),
      allowCancel: rules.allowCustomerCancel,
      allowReschedule: rules.allowCustomerReschedule,
    },
  }
}

export async function cancelManagedBooking(
  token: string,
  reason: string | null,
  meta: RequestMeta,
) {
  await enforceRateLimits([[`manage:ip:${meta.ip}`, POLICIES.manageByIp]])
  const { appt, business } = await loadByToken(token)
  const rules = await getOrCreateRules(db(), business.id)
  if (!customerCanCancel(appt.status, appt.startsAt, rules, new Date())) {
    throw new AppError(
      appt.status === 'cancelled' ? 'appointment_not_active' : 'cancellation_not_allowed',
    )
  }
  await cancelAppointment({
    business,
    appointmentId: appt.id,
    actor: { type: 'customer', ip: meta.ip, requestId: meta.requestId },
    reason,
  })
}

export async function managedAvailability(
  token: string,
  q: { from?: string; to?: string; staffId: string | null },
  meta: RequestMeta,
) {
  await enforceRateLimits([[`avail:ip:${meta.ip}`, POLICIES.availabilityByIp]])
  const { appt, business } = await loadByToken(token)
  const rules = await getOrCreateRules(db(), business.id)
  if (!customerCanReschedule(appt.status, appt.startsAt, rules, new Date()))
    throw new AppError('reschedule_not_allowed')
  const { from, to } = defaultRange(business.timezone, q)
  const days = await getAvailability({
    business,
    serviceId: appt.serviceId,
    staffId: q.staffId,
    from,
    to,
    excludeAppointmentId: appt.id,
  })
  return {
    timezone: business.timezone,
    today: todayIn(business.timezone),
    lastDate: addDays(todayIn(business.timezone), rules.maxAdvanceDays),
    days: days.map((d) => ({
      date: d.date,
      slots: d.slots.map((s) => ({ start: new Date(s.start).toISOString() })),
    })),
  }
}

export async function rescheduleManagedBooking(token: string, start: Date, meta: RequestMeta) {
  await enforceRateLimits([[`manage:ip:${meta.ip}`, POLICIES.manageByIp]])
  const { appt, business } = await loadByToken(token)
  const rules = await getOrCreateRules(db(), business.id)
  if (!customerCanReschedule(appt.status, appt.startsAt, rules, new Date())) {
    throw new AppError(
      appt.status === 'cancelled' ? 'appointment_not_active' : 'reschedule_not_allowed',
    )
  }
  const state = await bookingState(business)
  if (!state.accepting) throw new AppError('bookings_paused')
  // Keep the same staff member when free; otherwise any eligible colleague.
  const sameStaff = await rescheduleAppointment({
    business,
    appointmentId: appt.id,
    start,
    staffId: null,
    actor: { type: 'customer', ip: meta.ip, requestId: meta.requestId },
    enforceAvailability: true,
  })
  return { startsAt: sameStaff.startsAt.toISOString() }
}

export async function icsForToken(token: string) {
  const { appt, business } = await loadByToken(token)
  const [svc] = await db()
    .select({ name: services.name })
    .from(services)
    .where(and(eq(services.businessId, business.id), eq(services.id, appt.serviceId)))
    .limit(1)
  return { appt, business, serviceName: svc?.name ?? 'Appointment' }
}

export async function staffNamesForIds(businessId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>()
  const rows = await db()
    .select({ id: staff.id, name: staff.name })
    .from(staff)
    .where(and(eq(staff.businessId, businessId), inArray(staff.id, ids)))
  return new Map(rows.map((r) => [r.id, r.name]))
}
