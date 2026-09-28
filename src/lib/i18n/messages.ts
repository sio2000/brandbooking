/**
 * English message catalogue.
 *
 * Localization architecture: user-facing copy for errors, the public booking
 * flow and transactional emails lives here, keyed by stable ids. Adding a
 * language means adding a catalogue with the same shape (the `Messages` type
 * enforces completeness) and selecting it by `business.locale`.
 */

export const en = {
  errors: {
    validation: 'Some details need your attention.',
    unauthenticated: 'Please sign in to continue.',
    forbidden: "You don't have permission to do that.",
    not_found: "We couldn't find what you were looking for.",
    rate_limited: 'Too many attempts. Please wait a moment and try again.',
    conflict: 'This was changed by someone else. Refresh and try again.',
    internal:
      'Something unexpected happened on our side. Please try again. If it keeps happening, contact support.',
    invalid_credentials: "That email and password don't match. Check them and try again.",
    account_locked:
      'Too many failed sign-in attempts. For your security, sign-in is paused for 15 minutes.',
    email_taken: 'An account with this email already exists. Try signing in instead.',
    email_not_verified: 'Please verify your email address first. We can send you a new link.',
    weak_password: 'Choose a password with at least 10 characters that is not easy to guess.',
    token_invalid: 'This link is invalid or has already been used.',
    token_expired: 'This link has expired. Request a new one to continue.',
    slug_taken: 'That booking link is already taken. Try another one.',
    slot_unavailable: 'That time was just booked. Please choose another available time.',
    slot_invalid: 'That time is not available for booking. Please choose one of the times shown.',
    booking_page_unavailable: 'This booking page is not available.',
    bookings_paused: 'This business is not accepting online bookings right now.',
    business_suspended: 'This account is suspended. Contact support for help.',
    subscription_inactive:
      'Your subscription is not active. Update billing to continue accepting bookings.',
    cancellation_not_allowed:
      'This booking can no longer be cancelled online. Please contact the business directly.',
    reschedule_not_allowed:
      'This booking can no longer be rescheduled online. Please contact the business directly.',
    appointment_not_active: 'This appointment has already been cancelled or completed.',
    invalid_transition: "That status change isn't possible for this appointment.",
    upload_invalid: 'This file could not be used. Upload a JPG, PNG or WebP image under 5 MB.',
    upload_too_small: 'This image is too small. Use an image at least {min}px wide.',
    billing_not_configured: 'Billing is not configured yet. Please contact support.',
    last_owner: 'A business must always have an owner.',
    invitation_email_mismatch:
      'This invitation was sent to a different email address. Sign in with that address to accept it.',
    service_has_no_staff: 'Nobody is assigned to this service yet.',
  },
  booking: {
    steps: {
      service: 'Service',
      staff: 'Team member',
      date: 'Date',
      time: 'Time',
      details: 'Your details',
      confirm: 'Confirm',
    },
    anyStaff: 'Any available',
    anyStaffHint: 'We’ll match you with whoever is free.',
    noSlots: 'No free times on this day.',
    noSlotsHint: 'Try another date. Days with availability are highlighted.',
    timesShownIn: 'Times shown in {tz}',
    confirmTitle: 'You’re booked!',
    pendingTitle: 'Request received',
    pendingBody: '{business} will confirm your appointment shortly. We’ve emailed you the details.',
    confirmedBody: 'We’ve sent a confirmation to {email}.',
    pausedTitle: 'Online booking is paused',
    pausedDefault: 'We’re currently not accepting online bookings.',
    privacyNote: 'Your details are shared only with {business} to manage your appointment.',
  },
  email: {
    footerDefault: 'You received this email because you booked an appointment.',
    manageCta: 'Manage booking',
    addToCalendar: 'Add to calendar',
  },
} as const

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }
export type Messages = Widen<typeof en>
export type ErrorCode = keyof typeof en.errors

export const messages: Messages = en

export function interpolate(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`))
}
