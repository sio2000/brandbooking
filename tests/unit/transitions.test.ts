import { describe, expect, it } from 'vitest'
import {
  ACTIVE_STATUSES,
  availableTransitions,
  checkTransition,
  customerCanCancel,
  customerCanReschedule,
  deadlineFor,
  isActive,
  type Transition,
} from '@/server/booking/transitions'
import type { AppointmentStatus } from '@/server/db/schema'

const STATUSES: AppointmentStatus[] = ['pending', 'confirmed', 'completed', 'no_show', 'cancelled']
const TRANSITIONS: Transition[] = ['confirm', 'cancel', 'complete', 'no_show', 'reopen']

const start = new Date('2030-06-01T10:00:00Z')
const before = new Date(start.getTime() - 60_000)
const after = new Date(start.getTime() + 60_000)

// Expected target status for every allowed (from, transition) pair; everything else is invalid.
const ALLOWED: Record<string, AppointmentStatus> = {
  'pending:confirm': 'confirmed',
  'pending:cancel': 'cancelled',
  'confirmed:cancel': 'cancelled',
  'confirmed:complete': 'completed',
  'confirmed:no_show': 'no_show',
  'completed:reopen': 'confirmed',
  'no_show:reopen': 'confirmed',
}

describe('checkTransition', () => {
  for (const from of STATUSES) {
    for (const t of TRANSITIONS) {
      const key = `${from}:${t}`
      it(`${from} --${t}--> ${ALLOWED[key] ?? 'invalid'}`, () => {
        const r = checkTransition(from, t, start, after)
        if (ALLOWED[key]) expect(r).toEqual({ ok: true, to: ALLOWED[key] })
        else expect(r).toEqual({ ok: false, reason: 'invalid_transition' })
      })
    }
  }

  it('cancelled is terminal', () => {
    for (const t of TRANSITIONS)
      expect(checkTransition('cancelled', t, start, after).ok).toBe(false)
    expect(availableTransitions('cancelled', start, after)).toEqual([])
  })

  it('cannot complete or mark no-show before the appointment starts', () => {
    expect(checkTransition('confirmed', 'complete', start, before)).toEqual({
      ok: false,
      reason: 'not_started',
    })
    expect(checkTransition('confirmed', 'no_show', start, before)).toEqual({
      ok: false,
      reason: 'not_started',
    })
  })

  it('allows outcomes exactly at the start instant', () => {
    expect(checkTransition('confirmed', 'complete', start, start)).toEqual({
      ok: true,
      to: 'completed',
    })
    expect(checkTransition('confirmed', 'no_show', start, start)).toEqual({
      ok: true,
      to: 'no_show',
    })
  })

  it('reports invalid_transition (not not_started) for disallowed outcomes before start', () => {
    expect(checkTransition('pending', 'complete', start, before)).toEqual({
      ok: false,
      reason: 'invalid_transition',
    })
  })

  it('cancel and confirm are allowed before start', () => {
    expect(checkTransition('confirmed', 'cancel', start, before).ok).toBe(true)
    expect(checkTransition('pending', 'confirm', start, before).ok).toBe(true)
  })
})

describe('availableTransitions', () => {
  it('filters by time', () => {
    expect(availableTransitions('confirmed', start, before)).toEqual(['cancel'])
    expect(availableTransitions('confirmed', start, after)).toEqual([
      'cancel',
      'complete',
      'no_show',
    ])
    expect(availableTransitions('pending', start, after)).toEqual(['confirm', 'cancel'])
    expect(availableTransitions('completed', start, after)).toEqual(['reopen'])
    expect(availableTransitions('no_show', start, before)).toEqual(['reopen'])
  })
})

describe('isActive', () => {
  it('only pending and confirmed are active', () => {
    expect(STATUSES.filter(isActive)).toEqual(['pending', 'confirmed'])
    expect(ACTIVE_STATUSES).toEqual(['pending', 'confirmed'])
  })
})

describe('customer self-service deadlines', () => {
  const rules = {
    allowCustomerCancel: true,
    allowCustomerReschedule: true,
    cancellationDeadlineMinutes: 120,
    rescheduleDeadlineMinutes: 60,
  }
  const deadlineCancel = start.getTime() - 120 * 60_000
  const deadlineResched = start.getTime() - 60 * 60_000

  it('allows cancelling up to and including the deadline', () => {
    expect(customerCanCancel('confirmed', start, rules, new Date(deadlineCancel - 1))).toBe(true)
    expect(customerCanCancel('confirmed', start, rules, new Date(deadlineCancel))).toBe(true)
    expect(customerCanCancel('confirmed', start, rules, new Date(deadlineCancel + 1))).toBe(false)
  })

  it('uses its own deadline for rescheduling', () => {
    expect(customerCanReschedule('confirmed', start, rules, new Date(deadlineCancel + 1))).toBe(
      true,
    )
    expect(customerCanReschedule('confirmed', start, rules, new Date(deadlineResched))).toBe(true)
    expect(customerCanReschedule('confirmed', start, rules, new Date(deadlineResched + 1))).toBe(
      false,
    )
  })

  it('pending bookings can be cancelled/rescheduled; inactive ones cannot', () => {
    const early = new Date(start.getTime() - 7 * 86_400_000)
    expect(customerCanCancel('pending', start, rules, early)).toBe(true)
    expect(customerCanReschedule('pending', start, rules, early)).toBe(true)
    for (const s of ['cancelled', 'completed', 'no_show'] as const) {
      expect(customerCanCancel(s, start, rules, early), s).toBe(false)
      expect(customerCanReschedule(s, start, rules, early), s).toBe(false)
    }
  })

  it('respects the business switches', () => {
    const early = new Date(start.getTime() - 7 * 86_400_000)
    expect(
      customerCanCancel('confirmed', start, { ...rules, allowCustomerCancel: false }, early),
    ).toBe(false)
    expect(
      customerCanReschedule(
        'confirmed',
        start,
        { ...rules, allowCustomerReschedule: false },
        early,
      ),
    ).toBe(false)
    // Each switch only affects its own action.
    expect(
      customerCanReschedule('confirmed', start, { ...rules, allowCustomerCancel: false }, early),
    ).toBe(true)
  })

  it('a zero deadline allows changes until the start instant, never after', () => {
    const r0 = { ...rules, cancellationDeadlineMinutes: 0 }
    expect(customerCanCancel('confirmed', start, r0, start)).toBe(true)
    expect(customerCanCancel('confirmed', start, r0, after)).toBe(false)
  })

  it('deadlineFor subtracts minutes', () => {
    expect(deadlineFor(start, 90).toISOString()).toBe('2030-06-01T08:30:00.000Z')
    expect(deadlineFor(start, 0).getTime()).toBe(start.getTime())
  })
})
