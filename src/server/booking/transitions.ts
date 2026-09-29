/**
 * Appointment lifecycle rules (pure, unit-tested).
 *
 *   pending ──confirm──▶ confirmed ──complete──▶ completed
 *      │                    │  └────no-show────▶ no_show
 *      └──────cancel────────┴──▶ cancelled (terminal)
 *   completed / no_show ──reopen──▶ confirmed (to correct mistakes)
 */
import type { AppointmentStatus, BookingRules } from '@/server/db/schema'

export type Transition = 'confirm' | 'cancel' | 'complete' | 'no_show' | 'reopen'

const TARGET: Record<Transition, AppointmentStatus> = {
  confirm: 'confirmed',
  cancel: 'cancelled',
  complete: 'completed',
  no_show: 'no_show',
  reopen: 'confirmed',
}

const ALLOWED: Record<AppointmentStatus, Transition[]> = {
  pending: ['confirm', 'cancel'],
  confirmed: ['cancel', 'complete', 'no_show'],
  // Past appointments complete automatically, so the owner can switch a
  // completed visit to a no-show (and back) directly.
  completed: ['no_show', 'reopen'],
  no_show: ['complete', 'reopen'],
  cancelled: [],
}

export const ACTIVE_STATUSES: AppointmentStatus[] = ['pending', 'confirmed']

export function isActive(status: AppointmentStatus) {
  return status === 'pending' || status === 'confirmed'
}

export type TransitionCheck =
  { ok: true; to: AppointmentStatus } | { ok: false; reason: 'invalid_transition' | 'not_started' }

export function checkTransition(
  from: AppointmentStatus,
  t: Transition,
  startsAt: Date,
  now: Date,
): TransitionCheck {
  if (!ALLOWED[from].includes(t)) return { ok: false, reason: 'invalid_transition' }
  // Outcomes can only be recorded once the appointment has started.
  if ((t === 'complete' || t === 'no_show') && now.getTime() < startsAt.getTime()) {
    return { ok: false, reason: 'not_started' }
  }
  return { ok: true, to: TARGET[t] }
}

export function availableTransitions(
  from: AppointmentStatus,
  startsAt: Date,
  now: Date,
): Transition[] {
  return ALLOWED[from].filter((t) => checkTransition(from, t, startsAt, now).ok)
}

type CustomerRules = Pick<
  BookingRules,
  | 'allowCustomerCancel'
  | 'allowCustomerReschedule'
  | 'cancellationDeadlineMinutes'
  | 'rescheduleDeadlineMinutes'
>

export function customerCanCancel(
  status: AppointmentStatus,
  startsAt: Date,
  rules: CustomerRules,
  now: Date,
) {
  return (
    rules.allowCustomerCancel &&
    isActive(status) &&
    now.getTime() <= startsAt.getTime() - rules.cancellationDeadlineMinutes * 60_000
  )
}

export function customerCanReschedule(
  status: AppointmentStatus,
  startsAt: Date,
  rules: CustomerRules,
  now: Date,
) {
  return (
    rules.allowCustomerReschedule &&
    isActive(status) &&
    now.getTime() <= startsAt.getTime() - rules.rescheduleDeadlineMinutes * 60_000
  )
}

/** Latest moment a customer may cancel/reschedule online, for display. */
export function deadlineFor(startsAt: Date, minutes: number): Date {
  return new Date(startsAt.getTime() - minutes * 60_000)
}
