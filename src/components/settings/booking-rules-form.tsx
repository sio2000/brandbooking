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
import { useT } from '@/components/i18n/provider'
import { SaveBar, SettingsGroup } from './section'
import { useActionForm } from './use-action-form'
import {
  MAX_ADVANCE_DAYS,
  REMINDER_OFFSETS,
  changeDeadlineOptions,
  humanDays,
  humanMinutes,
  minNoticeOptions,
  reminderLabel,
  slotIntervalOptions,
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

/** Titles and explanations: `booking.form.staffModes.<value>` / `booking.form.phoneModes.<value>`. */
const STAFF_MODES = ['optional', 'required', 'hidden'] as const
const PHONE_MODES = ['required', 'optional', 'hidden'] as const

type T = ReturnType<typeof useT<'app-settings'>>

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

function summary(v: RulesValues, t: T) {
  const notice =
    v.minNoticeMinutes === 0
      ? t('booking.summary.lastMinute')
      : t('booking.summary.notice', { duration: humanMinutes(v.minNoticeMinutes, t) })
  return t('booking.summary.text', {
    notice,
    days: humanDays(v.maxAdvanceDays, t),
    interval:
      v.slotIntervalMinutes === 60
        ? t('booking.summary.onTheHour')
        : t('booking.summary.everyMinutes', { count: v.slotIntervalMinutes }),
  })
}

export function BookingRulesForm({ initial }: { initial: RulesValues }) {
  const t = useT('app-settings')
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
        <span>{summary(v, t)}</span>
      </p>
      <Card>
        <CardBody className="divide-y divide-border pt-5">
          <SettingsGroup
            id="window"
            title={t('booking.window.title')}
            description={t('booking.window.description')}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={t('booking.window.minNotice')}
                htmlFor="minNoticeMinutes"
                error={e.minNoticeMinutes}
                hint={t('booking.window.minNoticeHint')}
              >
                <DurationSelect
                  id="minNoticeMinutes"
                  value={v.minNoticeMinutes}
                  options={withCurrent(
                    minNoticeOptions(t),
                    v.minNoticeMinutes,
                    (m) => humanMinutes(m, t),
                    t,
                  )}
                  onChange={(x) => set('minNoticeMinutes', x)}
                />
              </Field>
              <Field
                label={t('booking.window.maxAdvance')}
                htmlFor="maxAdvanceDays"
                error={e.maxAdvanceDays}
                hint={t('booking.window.maxAdvanceHint')}
              >
                <DurationSelect
                  id="maxAdvanceDays"
                  value={v.maxAdvanceDays}
                  options={withCurrent(
                    MAX_ADVANCE_DAYS.map((d) => ({
                      value: d,
                      label: t('duration.ahead', { duration: humanDays(d, t) }),
                    })),
                    v.maxAdvanceDays,
                    (d) => humanDays(d, t),
                    t,
                  )}
                  onChange={(x) => set('maxAdvanceDays', x)}
                />
              </Field>
              <Field
                label={t('booking.window.startTimes')}
                htmlFor="slotIntervalMinutes"
                error={e.slotIntervalMinutes}
                hint={t('booking.window.startTimesHint')}
              >
                <DurationSelect
                  id="slotIntervalMinutes"
                  value={v.slotIntervalMinutes}
                  options={slotIntervalOptions(t)}
                  onChange={(x) => set('slotIntervalMinutes', x)}
                />
              </Field>
              <div className="grid grid-cols-1 content-start gap-1.5">
                <SwitchRow
                  id="limitPerDay"
                  label={t('booking.window.limit')}
                  description={t('booking.window.limitDescription')}
                  checked={limitOn}
                  onCheckedChange={(c) => set('maxBookingsPerDay', c ? '8' : '')}
                />
                {limitOn && (
                  <Field
                    label={t('booking.window.maxPerDay')}
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
            title={t('booking.confirm.title')}
            description={t('booking.confirm.description')}
          >
            <SwitchRow
              id="requiresConfirmation"
              label={t('booking.confirm.review')}
              description={
                v.requiresConfirmation
                  ? t('booking.confirm.reviewOn')
                  : t('booking.confirm.reviewOff')
              }
              checked={v.requiresConfirmation}
              onCheckedChange={(c) => set('requiresConfirmation', c)}
            />
          </SettingsGroup>

          <SettingsGroup
            id="changes"
            title={t('booking.changes.title')}
            description={t('booking.changes.description')}
          >
            <div className="grid grid-cols-1 gap-2">
              <SwitchRow
                id="allowCustomerCancel"
                label={t('booking.changes.cancel')}
                description={
                  v.allowCustomerCancel
                    ? t('booking.changes.cancelOn')
                    : t('booking.changes.cancelOff')
                }
                checked={v.allowCustomerCancel}
                onCheckedChange={(c) => set('allowCustomerCancel', c)}
              />
              {v.allowCustomerCancel && (
                <Field
                  label={t('booking.changes.cancelDeadline')}
                  htmlFor="cancellationDeadlineMinutes"
                  error={e.cancellationDeadlineMinutes}
                  hint={t('booking.changes.cancelDeadlineHint')}
                  className="mb-3 sm:max-w-xs"
                >
                  <DurationSelect
                    id="cancellationDeadlineMinutes"
                    value={v.cancellationDeadlineMinutes}
                    options={withCurrent(
                      changeDeadlineOptions(t),
                      v.cancellationDeadlineMinutes,
                      (m) => reminderLabel(m, t),
                      t,
                    )}
                    onChange={(x) => set('cancellationDeadlineMinutes', x)}
                  />
                </Field>
              )}
              <div className="border-t border-border" aria-hidden />
              <SwitchRow
                id="allowCustomerReschedule"
                label={t('booking.changes.reschedule')}
                description={
                  v.allowCustomerReschedule
                    ? t('booking.changes.rescheduleOn')
                    : t('booking.changes.rescheduleOff')
                }
                checked={v.allowCustomerReschedule}
                onCheckedChange={(c) => set('allowCustomerReschedule', c)}
              />
              {v.allowCustomerReschedule && (
                <Field
                  label={t('booking.changes.rescheduleDeadline')}
                  htmlFor="rescheduleDeadlineMinutes"
                  error={e.rescheduleDeadlineMinutes}
                  hint={t('booking.changes.rescheduleDeadlineHint')}
                  className="sm:max-w-xs"
                >
                  <DurationSelect
                    id="rescheduleDeadlineMinutes"
                    value={v.rescheduleDeadlineMinutes}
                    options={withCurrent(
                      changeDeadlineOptions(t),
                      v.rescheduleDeadlineMinutes,
                      (m) => reminderLabel(m, t),
                      t,
                    )}
                    onChange={(x) => set('rescheduleDeadlineMinutes', x)}
                  />
                </Field>
              )}
            </div>
          </SettingsGroup>

          <SettingsGroup
            id="reminders"
            title={t('booking.reminders.title')}
            description={t('booking.reminders.description', { max: MAX_REMINDERS })}
          >
            <fieldset>
              <legend className="sr-only">{t('booking.reminders.legend')}</legend>
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
                      {reminderLabel(m, t)}
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 text-[13px] text-muted-foreground" aria-live="polite">
                {v.reminderOffsetsMinutes.length === 0
                  ? t('booking.reminders.none')
                  : t('booking.reminders.selected', {
                      count: v.reminderOffsetsMinutes.length,
                      max: MAX_REMINDERS,
                      list: v.reminderOffsetsMinutes
                        .map((m) => reminderLabel(m, t))
                        .join(t('common.listSeparator')),
                    })}
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
            title={t('booking.form.title')}
            description={t('booking.form.description')}
          >
            <div className="grid grid-cols-1 gap-6">
              <fieldset>
                <legend className="mb-2 text-sm font-medium">{t('booking.form.staff')}</legend>
                <RadioGroup
                  value={v.staffSelection}
                  onValueChange={(x) => set('staffSelection', x as RulesValues['staffSelection'])}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                  aria-label={t('booking.form.staff')}
                >
                  {STAFF_MODES.map((m) => (
                    <RadioCard
                      key={m}
                      value={m}
                      className="flex flex-col items-start justify-start"
                    >
                      <span className="block text-sm font-semibold">
                        {t(`booking.form.staffModes.${m}.title`)}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                        {t(`booking.form.staffModes.${m}.body`)}
                      </span>
                    </RadioCard>
                  ))}
                </RadioGroup>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">{t('booking.form.phone')}</legend>
                <RadioGroup
                  value={v.phoneRequirement}
                  onValueChange={(x) =>
                    set('phoneRequirement', x as RulesValues['phoneRequirement'])
                  }
                  className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                  aria-label={t('booking.form.phone')}
                >
                  {PHONE_MODES.map((m) => (
                    <RadioCard
                      key={m}
                      value={m}
                      className="flex flex-col items-start justify-start"
                    >
                      <span className="block text-sm font-semibold">
                        {t(`booking.form.phoneModes.${m}.title`)}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                        {t(`booking.form.phoneModes.${m}.body`)}
                      </span>
                    </RadioCard>
                  ))}
                </RadioGroup>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  {t('booking.form.alwaysAsked')}
                </p>
              </fieldset>
            </div>
          </SettingsGroup>
        </CardBody>
      </Card>

      <SaveBar
        dirty={form.dirty}
        labels={{ unsaved: t('saveBar.unsaved'), saved: t('saveBar.saved') }}
      >
        {form.dirty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => form.reset()}
            disabled={form.pending}
          >
            {t('saveBar.discard')}
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          loading={form.pending}
          success={form.saved}
          disabled={!form.dirty && !form.pending}
        >
          {t('saveBar.save')}
        </Button>
      </SaveBar>
    </form>
  )
}
