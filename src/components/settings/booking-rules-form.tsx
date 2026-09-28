'use client'

import * as React from 'react'
import { Bell, Check, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field, FormError } from '@/components/ui/field'
import { Input, NativeSelect } from '@/components/ui/input'
import { RadioCard, RadioGroup, SwitchRow } from '@/components/ui/controls'
import { saveBookingRulesAction } from '@/app/app/_actions/settings'
import { cn } from '@/lib/utils'
import { SaveBar, SettingsGroup } from './section'
import { useActionForm } from './use-action-form'
import {
  CHANGE_DEADLINES,
  MAX_ADVANCE,
  MIN_NOTICE,
  REMINDER_OFFSETS,
  SLOT_INTERVALS,
  humanDays,
  humanMinutes,
  reminderLabel,
  withCurrent,
  type DurationOption,
} from './durations'

export type RulesValues = {
  minNoticeMinutes: number
  maxAdvanceDays: number
  slotIntervalMinutes: number
  cancellationDeadlineMinutes: number
  rescheduleDeadlineMinutes: number
  allowCustomerCancel: boolean
  allowCustomerReschedule: boolean
  requiresConfirmation: boolean
  maxBookingsPerDay: string
  reminderOffsetsMinutes: number[]
  staffSelection: 'optional' | 'required' | 'hidden'
  phoneRequirement: 'required' | 'optional' | 'hidden'
}

const MAX_REMINDERS = 3

const STAFF_MODES = [
  {
    value: 'optional',
    title: 'Customer may choose',
    body: 'Customers can pick a team member or choose “Any available”.',
  },
  {
    value: 'required',
    title: 'Customer must choose',
    body: 'Customers always pick a specific team member.',
  },
  {
    value: 'hidden',
    title: 'Don’t ask',
    body: 'We assign whoever is free. Customers never see a choice.',
  },
] as const

const PHONE_MODES = [
  { value: 'required', title: 'Required', body: 'Best if you call or text customers.' },
  { value: 'optional', title: 'Optional', body: 'Customers can leave it empty.' },
  { value: 'hidden', title: 'Don’t ask', body: 'The field isn’t shown at all.' },
] as const

function DurationSelect({
  id,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string
  value: number
  options: DurationOption[]
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <NativeSelect
      id={id}
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  )
}

function summary(v: RulesValues) {
  const notice =
    v.minNoticeMinutes === 0
      ? 'right up to the last minute'
      : `at least ${humanMinutes(v.minNoticeMinutes)} ahead`
  return `Customers can book ${notice}, and up to ${humanDays(v.maxAdvanceDays)} in advance. Start times are offered ${v.slotIntervalMinutes === 60 ? 'on the hour' : `every ${v.slotIntervalMinutes} minutes`}.`
}

export function BookingRulesForm({ initial }: { initial: RulesValues }) {
  const form = useActionForm(initial, saveBookingRulesAction)
  const { values: v, set, errors: e } = form
  const limitOn = v.maxBookingsPerDay !== ''

  function toggleReminder(m: number) {
    const has = v.reminderOffsetsMinutes.includes(m)
    if (!has && v.reminderOffsetsMinutes.length >= MAX_REMINDERS) return
    set(
      'reminderOffsetsMinutes',
      has
        ? v.reminderOffsetsMinutes.filter((x) => x !== m)
        : [...v.reminderOffsetsMinutes, m].sort((a, b) => b - a),
    )
  }

  return (
    <form onSubmit={form.submit} noValidate>
      <FormError message={form.formError} />
      <p
        className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-surface-2/60 px-4 py-3 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>{summary(v)}</span>
      </p>
      <Card>
        <CardBody className="divide-y divide-border pt-5">
          <SettingsGroup
            id="window"
            title="When customers can book"
            description="Protect your time: stop last-minute surprises and decide how far ahead your calendar opens."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Minimum notice"
                htmlFor="minNoticeMinutes"
                error={e.minNoticeMinutes}
                hint="How soon before an appointment someone can still book it online."
              >
                <DurationSelect
                  id="minNoticeMinutes"
                  value={v.minNoticeMinutes}
                  options={withCurrent(MIN_NOTICE, v.minNoticeMinutes, humanMinutes)}
                  onChange={(x) => set('minNoticeMinutes', x)}
                />
              </Field>
              <Field
                label="Book up to"
                htmlFor="maxAdvanceDays"
                error={e.maxAdvanceDays}
                hint="How far into the future customers can see free times."
              >
                <DurationSelect
                  id="maxAdvanceDays"
                  value={v.maxAdvanceDays}
                  options={withCurrent(MAX_ADVANCE, v.maxAdvanceDays, humanDays).map((o) => ({
                    ...o,
                    label: o.label.endsWith('(current)') ? o.label : `${o.label} ahead`,
                  }))}
                  onChange={(x) => set('maxAdvanceDays', x)}
                />
              </Field>
              <Field
                label="Start times"
                htmlFor="slotIntervalMinutes"
                error={e.slotIntervalMinutes}
                hint="With every 15 minutes, customers see 9:00, 9:15, 9:30… Longer steps keep your day tidier."
              >
                <DurationSelect
                  id="slotIntervalMinutes"
                  value={v.slotIntervalMinutes}
                  options={SLOT_INTERVALS}
                  onChange={(x) => set('slotIntervalMinutes', x)}
                />
              </Field>
              <div className="grid grid-cols-1 content-start gap-1.5">
                <SwitchRow
                  id="limitPerDay"
                  label="Limit online bookings per day"
                  description="Once the limit is reached, that day shows as full. You can still add appointments yourself."
                  checked={limitOn}
                  onCheckedChange={(c) => set('maxBookingsPerDay', c ? '8' : '')}
                />
                {limitOn && (
                  <Field
                    label="Maximum per day"
                    htmlFor="maxBookingsPerDay"
                    error={e.maxBookingsPerDay}
                  >
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1000}
                      value={v.maxBookingsPerDay}
                      onChange={(ev) => set('maxBookingsPerDay', ev.target.value)}
                      className="max-w-32"
                    />
                  </Field>
                )}
              </div>
            </div>
          </SettingsGroup>

          <SettingsGroup
            id="confirm"
            title="Confirmation"
            description="Choose whether new bookings are final straight away."
          >
            <SwitchRow
              id="requiresConfirmation"
              label="Review each booking before it’s confirmed"
              description={
                v.requiresConfirmation
                  ? 'New online bookings arrive as requests. The time is held, and the customer gets a confirmation email once you accept it.'
                  : 'Bookings are confirmed instantly and the customer gets their confirmation email right away.'
              }
              checked={v.requiresConfirmation}
              onCheckedChange={(c) => set('requiresConfirmation', c)}
            />
          </SettingsGroup>

          <SettingsGroup
            id="changes"
            title="Cancelling & rescheduling"
            description="Every confirmation email has a link customers can use to manage their booking. Decide what they can do themselves."
          >
            <div className="grid grid-cols-1 gap-2">
              <SwitchRow
                id="allowCustomerCancel"
                label="Customers can cancel online"
                description={
                  v.allowCustomerCancel
                    ? 'Freed-up times become bookable again automatically.'
                    : 'Customers need to contact you to cancel.'
                }
                checked={v.allowCustomerCancel}
                onCheckedChange={(c) => set('allowCustomerCancel', c)}
              />
              {v.allowCustomerCancel && (
                <Field
                  label="Cancellation deadline"
                  htmlFor="cancellationDeadlineMinutes"
                  error={e.cancellationDeadlineMinutes}
                  hint="After this point the cancel button disappears and customers are asked to contact you."
                  className="mb-3 sm:max-w-xs"
                >
                  <DurationSelect
                    id="cancellationDeadlineMinutes"
                    value={v.cancellationDeadlineMinutes}
                    options={withCurrent(
                      CHANGE_DEADLINES,
                      v.cancellationDeadlineMinutes,
                      (m) => `${humanMinutes(m)} before`,
                    )}
                    onChange={(x) => set('cancellationDeadlineMinutes', x)}
                  />
                </Field>
              )}
              <div className="border-t border-border" aria-hidden />
              <SwitchRow
                id="allowCustomerReschedule"
                label="Customers can reschedule online"
                description={
                  v.allowCustomerReschedule
                    ? 'They pick a new free time; the old one is released.'
                    : 'Customers need to contact you to move a booking.'
                }
                checked={v.allowCustomerReschedule}
                onCheckedChange={(c) => set('allowCustomerReschedule', c)}
              />
              {v.allowCustomerReschedule && (
                <Field
                  label="Rescheduling deadline"
                  htmlFor="rescheduleDeadlineMinutes"
                  error={e.rescheduleDeadlineMinutes}
                  hint="How close to the appointment customers can still move it."
                  className="sm:max-w-xs"
                >
                  <DurationSelect
                    id="rescheduleDeadlineMinutes"
                    value={v.rescheduleDeadlineMinutes}
                    options={withCurrent(
                      CHANGE_DEADLINES,
                      v.rescheduleDeadlineMinutes,
                      (m) => `${humanMinutes(m)} before`,
                    )}
                    onChange={(x) => set('rescheduleDeadlineMinutes', x)}
                  />
                </Field>
              )}
            </div>
          </SettingsGroup>

          <SettingsGroup
            id="reminders"
            title="Reminder emails"
            description={`Automatic reminders cut no-shows. Pick up to ${MAX_REMINDERS}. Customers without an email address won’t get them.`}
          >
            <fieldset>
              <legend className="sr-only">Send reminders</legend>
              <div className="flex flex-wrap gap-2">
                {REMINDER_OFFSETS.map((m) => {
                  const on = v.reminderOffsetsMinutes.includes(m)
                  const full = !on && v.reminderOffsetsMinutes.length >= MAX_REMINDERS
                  return (
                    <button
                      key={m}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-disabled={full || undefined}
                      onClick={() => toggleReminder(m)}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        on
                          ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                          : 'border-border-strong bg-surface text-foreground hover:bg-surface-2',
                        full && 'cursor-not-allowed opacity-45 hover:bg-surface',
                      )}
                    >
                      {on ? (
                        <Check className="size-3.5" aria-hidden />
                      ) : (
                        <Bell className="size-3.5 text-muted-foreground" aria-hidden />
                      )}
                      {reminderLabel(m)}
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 text-[13px] text-muted-foreground" aria-live="polite">
                {v.reminderOffsetsMinutes.length === 0
                  ? 'No reminders will be sent.'
                  : `${v.reminderOffsetsMinutes.length} of ${MAX_REMINDERS} selected: ${v.reminderOffsetsMinutes.map(reminderLabel).join(', ')}. Changes apply to future bookings.`}
              </p>
              {e.reminderOffsetsMinutes && (
                <p className="mt-1 text-[13px] font-medium text-danger">
                  {e.reminderOffsetsMinutes}
                </p>
              )}
            </fieldset>
          </SettingsGroup>

          <SettingsGroup
            id="form"
            title="Booking form"
            description="What customers are asked when they book."
          >
            <div className="grid grid-cols-1 gap-6">
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Choosing a team member</legend>
                <RadioGroup
                  value={v.staffSelection}
                  onValueChange={(x) => set('staffSelection', x as RulesValues['staffSelection'])}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                  aria-label="Choosing a team member"
                >
                  {STAFF_MODES.map((m) => (
                    <RadioCard
                      key={m.value}
                      value={m.value}
                      className="flex flex-col items-start justify-start"
                    >
                      <span className="block text-sm font-semibold">{m.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                        {m.body}
                      </span>
                    </RadioCard>
                  ))}
                </RadioGroup>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Phone number</legend>
                <RadioGroup
                  value={v.phoneRequirement}
                  onValueChange={(x) =>
                    set('phoneRequirement', x as RulesValues['phoneRequirement'])
                  }
                  className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                  aria-label="Phone number"
                >
                  {PHONE_MODES.map((m) => (
                    <RadioCard
                      key={m.value}
                      value={m.value}
                      className="flex flex-col items-start justify-start"
                    >
                      <span className="block text-sm font-semibold">{m.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                        {m.body}
                      </span>
                    </RadioCard>
                  ))}
                </RadioGroup>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Name and email are always asked for, so we can send confirmations.
                </p>
              </fieldset>
            </div>
          </SettingsGroup>
        </CardBody>
      </Card>

      <SaveBar dirty={form.dirty}>
        {form.dirty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => form.reset()}
            disabled={form.pending}
          >
            Discard
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          loading={form.pending}
          success={form.saved}
          disabled={!form.dirty && !form.pending}
        >
          Save changes
        </Button>
      </SaveBar>
    </form>
  )
}
