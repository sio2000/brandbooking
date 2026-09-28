'use client'

import * as React from 'react'
import { CalendarRange, Check, ChevronDown, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu'
import { Input, NativeSelect } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatSpan, RANGE_PRESETS, type RangePreset } from './presets'
import { useAnalyticsFrame } from './analytics-frame'

type Option = { id: string; name: string; isActive?: boolean }

const MAX_DAYS = 366
const DAY_MS = 86_400_000

function spanDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1
}

export function FilterBar({
  preset,
  from,
  to,
  previous,
  today,
  staff,
  services,
  staffId,
  serviceId,
  lockedStaffId,
}: {
  preset: RangePreset
  from: string
  to: string
  previous: { from: string; to: string }
  today: string
  staff: Option[]
  services: Option[]
  staffId: string | null
  serviceId: string | null
  lockedStaffId: string | null
}) {
  const { setParams, pending } = useAnalyticsFrame()
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState({ from, to })
  const [error, setError] = React.useState<string | null>(null)
  const presetLabel = RANGE_PRESETS.find((p) => p.value === preset)?.label ?? 'Custom range'

  const onOpenChange = (next: boolean) => {
    if (next) {
      setDraft({ from, to })
      setError(null)
    }
    setOpen(next)
  }

  const choose = (value: RangePreset) => {
    setOpen(false)
    setParams({ range: value === '30d' ? null : value, from: null, to: null })
  }

  const applyCustom = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.from || !draft.to) return setError('Choose a start and an end date.')
    if (draft.from > draft.to) return setError('The start date must be on or before the end date.')
    if (spanDays(draft.from, draft.to) > MAX_DAYS)
      return setError(`Choose a range of at most ${MAX_DAYS} days.`)
    setOpen(false)
    setParams({ range: 'custom', from: draft.from, to: draft.to })
  }

  const hasDimensionFilter = Boolean((staffId && !lockedStaffId) || serviceId)

  return (
    <div className="mb-6 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-10 max-w-full min-w-0 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm shadow-xs transition-colors outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Date range: ${presetLabel}, ${formatSpan(from, to)}`}
            >
              <CalendarRange className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="font-medium">{presetLabel}</span>
              <span className="hidden truncate text-muted-foreground sm:inline">
                {formatSpan(from, to)}
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] p-1">
            <div role="listbox" aria-label="Date range presets">
              {RANGE_PRESETS.filter((p) => p.value !== 'custom').map((p) => {
                const selected = p.value === preset
                return (
                  <button
                    key={p.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => choose(p.value)}
                    className={cn(
                      'flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm outline-none hover:bg-surface-2 focus-visible:bg-surface-2',
                      selected && 'font-semibold',
                    )}
                  >
                    <span className="grid size-4 place-items-center" aria-hidden>
                      {selected && <Check className="size-4 text-primary" strokeWidth={3} />}
                    </span>
                    {p.label}
                  </button>
                )
              })}
            </div>
            <form
              onSubmit={applyCustom}
              className="mt-1 border-t border-border px-2.5 pt-3 pb-2"
              noValidate
            >
              <p
                className={cn(
                  'mb-2 flex items-center gap-2 text-sm',
                  preset === 'custom' ? 'font-semibold' : 'text-muted-foreground',
                )}
              >
                <span className="grid size-4 place-items-center" aria-hidden>
                  {preset === 'custom' && <Check className="size-4 text-primary" strokeWidth={3} />}
                </span>
                Custom range
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-muted-foreground">
                  From
                  <Input
                    type="date"
                    value={draft.from}
                    max={draft.to || undefined}
                    onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                    className="mt-1 h-9 px-2 text-sm"
                    aria-invalid={Boolean(error) || undefined}
                  />
                </label>
                <label className="text-xs font-medium text-muted-foreground">
                  To
                  <Input
                    type="date"
                    value={draft.to}
                    min={draft.from || undefined}
                    onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                    className="mt-1 h-9 px-2 text-sm"
                    aria-invalid={Boolean(error) || undefined}
                  />
                </label>
              </div>
              {error && (
                <p role="alert" className="mt-2 text-xs text-danger">
                  {error}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setDraft({ from: today, to: today })}
                >
                  Today
                </button>
                <Button type="submit" size="sm">
                  Apply
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>

        <label className="sr-only" htmlFor="analytics-staff">
          Team member
        </label>
        <div className="w-full min-w-0 sm:w-52">
          <NativeSelect
            id="analytics-staff"
            value={lockedStaffId ?? staffId ?? ''}
            disabled={Boolean(lockedStaffId)}
            onChange={(e) => setParams({ staff: e.target.value || null })}
          >
            {!lockedStaffId && <option value="">All team members</option>}
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isActive === false ? ' (inactive)' : ''}
              </option>
            ))}
          </NativeSelect>
        </div>

        <label className="sr-only" htmlFor="analytics-service">
          Service
        </label>
        <div className="w-full min-w-0 sm:w-52">
          <NativeSelect
            id="analytics-service"
            value={serviceId ?? ''}
            onChange={(e) => setParams({ service: e.target.value || null })}
          >
            <option value="">All services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isActive === false ? ' (inactive)' : ''}
              </option>
            ))}
          </NativeSelect>
        </div>

        {hasDimensionFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setParams({ staff: null, service: null })}
          >
            <X aria-hidden /> Clear filters
          </Button>
        )}
      </div>
      <p
        className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground"
        aria-live="polite"
      >
        <span className="sm:hidden">{formatSpan(from, to)} ·</span>
        <span>
          Compared with{' '}
          <span className="text-foreground">{formatSpan(previous.from, previous.to)}</span>
        </span>
        {pending && <span className="text-subtle-foreground">Updating…</span>}
      </p>
    </div>
  )
}
