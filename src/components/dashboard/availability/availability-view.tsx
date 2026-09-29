'use client'

import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarOff, Copy, Plus, Repeat, Sparkles, Trash2, Clock4, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Switch, Checkbox } from '@/components/ui/controls'
import { Alert } from '@/components/ui/feedback'
import { Field, FormError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toaster'
import { useLocale, useT } from '@/components/i18n/provider'
import { cn } from '@/lib/utils'
import { formatDateTime, formatMinutesOfDay, formatPlainDate, formatTime } from '@/lib/format'
import {
  addClosureAction,
  addTimeBlockAction,
  clearSpecialHoursAction,
  removeClosureAction,
  removeTimeBlockAction,
  saveWeeklyHoursAction,
  setSpecialHoursAction,
  followBusinessHoursAction,
} from '@/app/app/_actions/availability'

type Range = { start: number; end: number }
type Props = {
  timezone: string
  manageAll: boolean
  staff: Array<{ id: string; name: string; usesBusinessHours: boolean; color: string }>
  selectedStaffId: string | null
  weekly: Array<{ staffId: string | null; weekday: number; start: number; end: number }>
  special: Array<{ staffId: string | null; date: string; start: number; end: number }>
  closures: Array<{
    id: string
    staffId: string | null
    startsOn: string
    endsOn: string
    label: string | null
    recurringYearly: boolean
  }>
  blocks: Array<{
    id: string
    staffId: string | null
    startsAt: string
    endsAt: string
    reason: string | null
  }>
}

/** Weekday names in the page language, Monday first (weekday 1 = Monday, as stored). */
function weekdayNames(tag: string) {
  const f = new Intl.DateTimeFormat(tag, { weekday: 'long', timeZone: 'UTC' })
  // 1 Jan 2024 was a Monday.
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))))
}
const toTime = (m: number) =>
  m >= 1440
    ? '24:00'
    : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const fromTime = (t: string) => {
  if (t === '24:00' || t === '00:00_end') return 1440
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function AvailabilityView(p: Props) {
  const t = useT('app-availability')
  const router = useRouter()
  const pathname = usePathname()
  const sel = p.selectedStaffId
  const selStaff = p.staff.find((s) => s.id === sel)
  const followsBusiness = Boolean(selStaff?.usesBusinessHours)
  const scope = (x: { staffId: string | null }) => x.staffId === sel

  return (
    <div className="grid grid-cols-1 gap-6">
      {(p.manageAll || p.staff.length > 1) && (
        <div
          className="-mx-4 flex scrollbar-thin gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0"
          role="tablist"
          aria-label={t('tabs.label')}
        >
          {p.manageAll && (
            <TabPill active={sel === null} onClick={() => router.push(pathname)}>
              {t('tabs.business')}
            </TabPill>
          )}
          {p.staff.map((s) => (
            <TabPill
              key={s.id}
              active={sel === s.id}
              onClick={() => router.push(`${pathname}?staff=${s.id}`)}
            >
              <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />{' '}
              {s.name}
            </TabPill>
          ))}
        </div>
      )}

      {sel && followsBusiness ? (
        <Card>
          <CardHeader title={t('weekly.staffTitle', { name: selStaff!.name })} />
          <CardBody className="grid gap-4">
            <Alert tone="info" title={t('weekly.followsTitle')}>
              {t('weekly.followsBody', { name: selStaff!.name })}
            </Alert>
            <WeeklyEditor
              staffId={sel}
              initial={groupWeekly(p.weekly.filter((w) => w.staffId === null))}
              note={t('weekly.followsNote')}
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={sel ? t('weekly.staffTitle', { name: selStaff?.name ?? '' }) : t('weekly.title')}
            description={sel ? t('weekly.staffDescription') : t('weekly.description')}
            action={sel ? <FollowBusinessButton staffId={sel} /> : undefined}
          />
          <CardBody>
            <WeeklyEditor staffId={sel} initial={groupWeekly(p.weekly.filter(scope))} />
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ClosuresCard {...p} />
        <SpecialHoursCard {...p} />
      </div>
      <BlocksCard {...p} />
      <p className="text-center text-xs text-subtle-foreground">
        {t('allTimesIn', { tz: p.timezone.replace(/_/g, ' ') })}
      </p>
    </div>
  )
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-surface hover:border-border-strong',
      )}
    >
      {children}
    </button>
  )
}

function FollowBusinessButton({ staffId }: { staffId: string }) {
  const t = useT('app-availability')
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={async () => {
        setPending(true)
        const r = await followBusinessHoursAction(staffId)
        setPending(false)
        if (r.ok) {
          toast.success(r.message ?? t('toasts.saved'))
          router.refresh()
        } else toast.error(r.error)
      }}
    >
      {t('weekly.useBusiness')}
    </Button>
  )
}

function groupWeekly(
  rows: Array<{ weekday: number; start: number; end: number }>,
): Record<number, Range[]> {
  const out: Record<number, Range[]> = {}
  for (let d = 1; d <= 7; d++)
    out[d] = rows
      .filter((r) => r.weekday === d)
      .sort((a, b) => a.start - b.start)
      .map((r) => ({ start: r.start, end: r.end }))
  return out
}

function WeeklyEditor({
  staffId,
  initial,
  note,
}: {
  staffId: string | null
  initial: Record<number, Range[]>
  note?: string
}) {
  const t = useT('app-availability')
  const { tag } = useLocale()
  const DAYS = weekdayNames(tag)
  const router = useRouter()
  const [days, setDays] = React.useState(initial)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const dirty = JSON.stringify(days) !== JSON.stringify(initial)

  const update = (d: number, fn: (r: Range[]) => Range[]) =>
    setDays((x) => ({ ...x, [d]: fn(x[d] ?? []) }))
  const problems: Record<number, string> = {}
  for (let d = 1; d <= 7; d++) {
    const r = [...(days[d] ?? [])].sort((a, b) => a.start - b.start)
    if (r.some((x) => x.end <= x.start)) problems[d] = t('weekly.endAfterStart')
    else if (r.some((x, i) => i > 0 && x.start < r[i - 1]!.end)) problems[d] = t('weekly.overlap')
  }

  async function save() {
    if (Object.keys(problems).length) return setError(t('weekly.fixDays'))
    setPending(true)
    setError(null)
    const r = await saveWeeklyHoursAction({
      staffId,
      days: Object.entries(days).map(([weekday, ranges]) => ({ weekday: Number(weekday), ranges })),
    })
    setPending(false)
    if (r.ok) {
      toast.success(r.message ?? t('toasts.saved'))
      router.refresh()
    } else setError(r.error)
  }

  return (
    <div className="grid gap-4">
      {note && <p className="text-[13px] text-muted-foreground">{note}</p>}
      <FormError message={error} />
      <ul className="divide-y divide-border rounded-xl border border-border">
        {DAYS.map((label, i) => {
          const d = i + 1
          const ranges = days[d] ?? []
          const open = ranges.length > 0
          return (
            <li key={d} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:p-4">
              <div className="flex w-40 shrink-0 items-center gap-3 pt-1.5">
                <Switch
                  id={`day-${d}`}
                  checked={open}
                  onCheckedChange={(c) => update(d, () => (c ? [{ start: 540, end: 1020 }] : []))}
                  aria-label={t('weekly.dayOpen', { day: label })}
                />
                <label htmlFor={`day-${d}`} className="font-medium">
                  {label}
                </label>
              </div>
              <div className="min-w-0 flex-1">
                {!open ? (
                  <p className="pt-2 text-sm text-muted-foreground">{t('weekly.closed')}</p>
                ) : (
                  <div className="grid gap-2">
                    <AnimatePresence initial={false}>
                      {ranges.map((r, ri) => (
                        <motion.div
                          key={ri}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 sm:flex"
                        >
                          <Input
                            type="time"
                            step={300}
                            aria-label={t('weekly.rangeStart', { day: label, n: ri + 1 })}
                            value={toTime(r.start)}
                            onChange={(e) =>
                              update(d, (rs) =>
                                rs.map((x, j) =>
                                  j === ri ? { ...x, start: fromTime(e.target.value) } : x,
                                ),
                              )
                            }
                            className="h-9 w-full min-w-0 px-2 sm:w-32 sm:px-3"
                          />
                          <span className="text-muted-foreground">–</span>
                          <Input
                            type="time"
                            step={300}
                            aria-label={t('weekly.rangeEnd', { day: label, n: ri + 1 })}
                            value={r.end === 1440 ? '23:59' : toTime(r.end)}
                            onChange={(e) =>
                              update(d, (rs) =>
                                rs.map((x, j) =>
                                  j === ri
                                    ? {
                                        ...x,
                                        end:
                                          e.target.value === '23:59'
                                            ? 1440
                                            : fromTime(e.target.value),
                                      }
                                    : x,
                                ),
                              )
                            }
                            className="h-9 w-full min-w-0 px-2 sm:w-32 sm:px-3"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('weekly.removeRange', { day: label, n: ri + 1 })}
                            onClick={() => update(d, (rs) => rs.filter((_, j) => j !== ri))}
                          >
                            <Trash2 />
                          </Button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {problems[d] && (
                      <p className="text-[13px] font-medium text-danger" role="alert">
                        {problems[d]}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
                        onClick={() =>
                          update(d, (rs) => {
                            const last = rs[rs.length - 1]
                            const start = Math.min((last?.end ?? 780) + 60, 1380)
                            return [...rs, { start, end: Math.min(start + 240, 1440) }]
                          })
                        }
                      >
                        <Plus className="size-3.5" /> {t('weekly.addRange')}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setDays((x) => {
                            const n = { ...x }
                            for (let k = 1; k <= 5; k++) n[k] = ranges.map((z) => ({ ...z }))
                            return n
                          })
                        }
                      >
                        <Copy className="size-3.5" /> {t('weekly.copyWeekdays')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-[13px] text-muted-foreground">{t('weekly.unsaved')}</span>}
        <Button onClick={save} loading={pending} disabled={!dirty}>
          {t('weekly.save')}
        </Button>
      </div>
    </div>
  )
}

function ClosuresCard(p: Props) {
  const t = useT('app-availability')
  const { tag } = useLocale()
  const router = useRouter()
  const list = p.closures.filter((c) =>
    p.selectedStaffId ? c.staffId === p.selectedStaffId : c.staffId === null,
  )
  const [v, setV] = React.useState({ startsOn: '', endsOn: '', label: '', recurringYearly: false })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [pending, setPending] = React.useState(false)
  const who = p.selectedStaffId ? p.staff.find((s) => s.id === p.selectedStaffId)?.name : null
  return (
    <Card>
      <CardHeader
        title={who ? t('closures.staffTitle', { name: who }) : t('closures.title')}
        description={who ? t('closures.staffDescription') : t('closures.description')}
      />
      <CardBody className="grid gap-4">
        <form
          className="grid gap-3 rounded-xl bg-surface-2 p-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setPending(true)
            const r = await addClosureAction({
              ...v,
              endsOn: v.endsOn || v.startsOn,
              staffId: p.selectedStaffId,
            })
            setPending(false)
            if (r.ok) {
              toast.success(r.message ?? t('toasts.added'))
              setV({ startsOn: '', endsOn: '', label: '', recurringYearly: false })
              setErrors({})
              router.refresh()
            } else setErrors(r.fields ?? { _form: r.error })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('closures.from')} htmlFor="cl-from" error={errors.startsOn}>
              <Input
                type="date"
                value={v.startsOn}
                onChange={(e) => setV({ ...v, startsOn: e.target.value })}
                required
              />
            </Field>
            <Field label={t('closures.to')} htmlFor="cl-to" optional error={errors.endsOn}>
              <Input
                type="date"
                value={v.endsOn}
                min={v.startsOn}
                onChange={(e) => setV({ ...v, endsOn: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t('closures.label')} htmlFor="cl-label" optional>
            <Input
              value={v.label}
              onChange={(e) => setV({ ...v, label: e.target.value })}
              placeholder={who ? t('closures.staffPlaceholder') : t('closures.placeholder')}
              maxLength={120}
            />
          </Field>
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox
              checked={v.recurringYearly}
              onCheckedChange={(c) => setV({ ...v, recurringYearly: c === true })}
            />{' '}
            {t('closures.yearly')}
          </label>
          {errors._form && <p className="text-[13px] font-medium text-danger">{errors._form}</p>}
          <Button
            type="submit"
            size="sm"
            loading={pending}
            disabled={!v.startsOn}
            className="justify-self-start"
          >
            <CalendarOff /> {t('closures.add')}
          </Button>
        </form>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('closures.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.label || t('closures.closed')}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {formatPlainDate(c.startsOn, tag, {
                      day: 'numeric',
                      month: 'short',
                      ...(c.recurringYearly ? {} : { year: 'numeric' }),
                    })}
                    {c.endsOn !== c.startsOn &&
                      ` – ${formatPlainDate(c.endsOn, tag, { day: 'numeric', month: 'short', ...(c.recurringYearly ? {} : { year: 'numeric' }) })}`}
                  </p>
                </div>
                {c.recurringYearly && (
                  <Badge tone="info">
                    <Repeat /> {t('closures.yearlyBadge')}
                  </Badge>
                )}
                <RemoveButton
                  label={
                    c.label ? t('closures.removeNamed', { label: c.label }) : t('closures.remove')
                  }
                  run={() => removeClosureAction(c.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function SpecialHoursCard(p: Props) {
  const t = useT('app-availability')
  const { tag } = useLocale()
  const router = useRouter()
  const byDate = new Map<string, Range[]>()
  for (const s of p.special.filter((x) => x.staffId === p.selectedStaffId))
    byDate.set(s.date, [...(byDate.get(s.date) ?? []), { start: s.start, end: s.end }])
  const [v, setV] = React.useState({ date: '', start: '10:00', end: '14:00' })
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  return (
    <Card>
      <CardHeader title={t('special.title')} description={t('special.description')} />
      <CardBody className="grid gap-4">
        <form
          className="grid gap-3 rounded-xl bg-surface-2 p-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setPending(true)
            const r = await setSpecialHoursAction({
              staffId: p.selectedStaffId,
              onDate: v.date,
              ranges: [{ start: fromTime(v.start), end: fromTime(v.end) }],
            })
            setPending(false)
            if (r.ok) {
              toast.success(r.message ?? t('toasts.saved'))
              setError(null)
              router.refresh()
            } else setError(r.error)
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('special.date')} htmlFor="sh-date">
              <Input
                type="date"
                value={v.date}
                onChange={(e) => setV({ ...v, date: e.target.value })}
                required
              />
            </Field>
            <Field label={t('special.opens')} htmlFor="sh-start">
              <Input
                type="time"
                step={300}
                value={v.start}
                onChange={(e) => setV({ ...v, start: e.target.value })}
              />
            </Field>
            <Field label={t('special.closes')} htmlFor="sh-end">
              <Input
                type="time"
                step={300}
                value={v.end}
                onChange={(e) => setV({ ...v, end: e.target.value })}
              />
            </Field>
          </div>
          <FormError message={error} />
          <Button
            type="submit"
            size="sm"
            loading={pending}
            disabled={!v.date}
            className="justify-self-start"
          >
            <Sparkles /> {t('special.add')}
          </Button>
        </form>
        {byDate.size === 0 ? (
          <p className="text-sm text-muted-foreground">{t('special.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {[...byDate.entries()].map(([date, ranges]) => (
              <li key={date} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{formatPlainDate(date, tag)}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {ranges
                      .map(
                        (r) =>
                          `${formatMinutesOfDay(r.start, tag)} – ${formatMinutesOfDay(r.end, tag)}`,
                      )
                      .join(t('listSeparator'))}
                  </p>
                </div>
                <RemoveButton
                  label={t('special.remove', { date: formatPlainDate(date, tag) })}
                  run={() => clearSpecialHoursAction(date, p.selectedStaffId)}
                />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function BlocksCard(p: Props) {
  const t = useT('app-availability')
  const { tag } = useLocale()
  const router = useRouter()
  const list = p.blocks.filter((b) =>
    p.selectedStaffId ? b.staffId === p.selectedStaffId || b.staffId === null : true,
  )
  const [v, setV] = React.useState({ date: '', start: '12:00', end: '13:00', reason: '' })
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  return (
    <Card>
      <CardHeader title={t('blocks.title')} description={t('blocks.description')} />
      <CardBody className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form
          className="grid content-start gap-3 rounded-xl bg-surface-2 p-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setPending(true)
            const r = await addTimeBlockAction({
              staffId: p.selectedStaffId,
              date: v.date,
              startMinute: fromTime(v.start),
              endMinute: fromTime(v.end),
              reason: v.reason,
            })
            setPending(false)
            if (r.ok) {
              toast.success(r.message ?? t('toasts.blocked'))
              setError(null)
              router.refresh()
            } else setError(r.fields ? (Object.values(r.fields)[0] ?? r.error) : r.error)
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('blocks.date')} htmlFor="tb-date">
              <Input
                type="date"
                value={v.date}
                onChange={(e) => setV({ ...v, date: e.target.value })}
                required
              />
            </Field>
            <Field label={t('blocks.from')} htmlFor="tb-start">
              <Input
                type="time"
                step={300}
                value={v.start}
                onChange={(e) => setV({ ...v, start: e.target.value })}
              />
            </Field>
            <Field label={t('blocks.until')} htmlFor="tb-end">
              <Input
                type="time"
                step={300}
                value={v.end}
                onChange={(e) => setV({ ...v, end: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t('blocks.reason')} htmlFor="tb-reason" optional>
            <Input
              value={v.reason}
              onChange={(e) => setV({ ...v, reason: e.target.value })}
              maxLength={200}
            />
          </Field>
          <FormError message={error} />
          <Button
            type="submit"
            size="sm"
            loading={pending}
            disabled={!v.date}
            className="justify-self-start"
          >
            <Ban /> {p.selectedStaffId ? t('blocks.add') : t('blocks.addForEveryone')}
          </Button>
        </form>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('blocks.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Clock4 className="size-4 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatDateTime(b.startsAt, p.timezone, tag)} –{' '}
                    {formatTime(b.endsAt, p.timezone, tag)}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {b.reason || t('blocks.blocked')}
                    {b.staffId === null ? ` · ${t('blocks.everyone')}` : ''}
                  </p>
                </div>
                <RemoveButton label={t('blocks.remove')} run={() => removeTimeBlockAction(b.id)} />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function RemoveButton({
  label,
  run,
}: {
  label: string
  run: () => Promise<{ ok: boolean; error?: string; message?: string }>
}) {
  const t = useT('app-availability')
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      loading={pending}
      onClick={async () => {
        setPending(true)
        const r = await run()
        setPending(false)
        if (r.ok) {
          toast.success(r.message ?? t('toasts.removed'))
          router.refresh()
        } else toast.error(r.error ?? t('toasts.failed'))
      }}
    >
      <Trash2 />
    </Button>
  )
}
