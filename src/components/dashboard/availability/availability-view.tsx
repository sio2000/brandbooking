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
import { cn } from '@/lib/utils'
import { formatDateTime, formatMinutesOfDay, formatPlainDate } from '@/lib/format'
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

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
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
          aria-label="Whose schedule"
        >
          {p.manageAll && (
            <TabPill active={sel === null} onClick={() => router.push(pathname)}>
              Business hours
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
          <CardHeader title={`${selStaff!.name}’s weekly schedule`} />
          <CardBody className="grid gap-4">
            <Alert tone="info" title="Follows your business hours">
              {selStaff!.name} is bookable whenever the business is open. Give them their own
              schedule if they work fewer hours.
            </Alert>
            <WeeklyEditor
              staffId={sel}
              initial={groupWeekly(p.weekly.filter((w) => w.staffId === null))}
              note="Start from the business hours and adjust. Hours outside business opening hours won’t be bookable."
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={sel ? `${selStaff?.name}’s weekly schedule` : 'Opening hours'}
            description={
              sel
                ? 'Their bookable hours each week (always within business opening hours).'
                : 'Your regular weekly hours. Add a second time range for a lunch break or split shift.'
            }
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
        All times in {p.timezone.replace(/_/g, ' ')}.
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
          toast.success(r.message ?? 'Saved')
          router.refresh()
        } else toast.error(r.error)
      }}
    >
      Use business hours
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
    if (r.some((x) => x.end <= x.start)) problems[d] = 'End time must be after start time.'
    else if (r.some((x, i) => i > 0 && x.start < r[i - 1]!.end))
      problems[d] = 'Time ranges overlap.'
  }

  async function save() {
    if (Object.keys(problems).length) return setError('Fix the highlighted days first.')
    setPending(true)
    setError(null)
    const r = await saveWeeklyHoursAction({
      staffId,
      days: Object.entries(days).map(([weekday, ranges]) => ({ weekday: Number(weekday), ranges })),
    })
    setPending(false)
    if (r.ok) {
      toast.success(r.message ?? 'Saved')
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
                  aria-label={`${label} open`}
                />
                <label htmlFor={`day-${d}`} className="font-medium">
                  {label}
                </label>
              </div>
              <div className="min-w-0 flex-1">
                {!open ? (
                  <p className="pt-2 text-sm text-muted-foreground">Closed</p>
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
                            aria-label={`${label} range ${ri + 1} start`}
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
                            aria-label={`${label} range ${ri + 1} end`}
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
                            aria-label={`Remove ${label} range ${ri + 1}`}
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
                        <Plus className="size-3.5" /> Add hours (after a break)
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
                        <Copy className="size-3.5" /> Copy to Mon–Fri
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
        {dirty && <span className="text-[13px] text-muted-foreground">Unsaved changes</span>}
        <Button onClick={save} loading={pending} disabled={!dirty}>
          Save hours
        </Button>
      </div>
    </div>
  )
}

function ClosuresCard(p: Props) {
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
        title={who ? `${who}’s days off` : 'Holidays & closures'}
        description={
          who
            ? 'Vacation, sick days, training.'
            : 'Whole days you’re closed. Recurring holidays repeat every year.'
        }
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
              toast.success(r.message ?? 'Added')
              setV({ startsOn: '', endsOn: '', label: '', recurringYearly: false })
              setErrors({})
              router.refresh()
            } else setErrors(r.fields ?? { _form: r.error })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From" htmlFor="cl-from" error={errors.startsOn}>
              <Input
                type="date"
                value={v.startsOn}
                onChange={(e) => setV({ ...v, startsOn: e.target.value })}
                required
              />
            </Field>
            <Field label="To" htmlFor="cl-to" optional error={errors.endsOn}>
              <Input
                type="date"
                value={v.endsOn}
                min={v.startsOn}
                onChange={(e) => setV({ ...v, endsOn: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Label" htmlFor="cl-label" optional>
            <Input
              value={v.label}
              onChange={(e) => setV({ ...v, label: e.target.value })}
              placeholder={who ? 'e.g. Vacation' : 'e.g. Christmas'}
              maxLength={120}
            />
          </Field>
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox
              checked={v.recurringYearly}
              onCheckedChange={(c) => setV({ ...v, recurringYearly: c === true })}
            />{' '}
            Repeats every year
          </label>
          {errors._form && <p className="text-[13px] font-medium text-danger">{errors._form}</p>}
          <Button
            type="submit"
            size="sm"
            loading={pending}
            disabled={!v.startsOn}
            className="justify-self-start"
          >
            <CalendarOff /> Add closure
          </Button>
        </form>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming closures.</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.label || 'Closed'}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {formatPlainDate(c.startsOn, 'en', {
                      day: 'numeric',
                      month: 'short',
                      ...(c.recurringYearly ? {} : { year: 'numeric' }),
                    })}
                    {c.endsOn !== c.startsOn &&
                      ` – ${formatPlainDate(c.endsOn, 'en', { day: 'numeric', month: 'short', ...(c.recurringYearly ? {} : { year: 'numeric' }) })}`}
                  </p>
                </div>
                {c.recurringYearly && (
                  <Badge tone="info">
                    <Repeat /> Yearly
                  </Badge>
                )}
                <RemoveButton
                  label={`Remove ${c.label || 'closure'}`}
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
  const router = useRouter()
  const byDate = new Map<string, Range[]>()
  for (const s of p.special.filter((x) => x.staffId === p.selectedStaffId))
    byDate.set(s.date, [...(byDate.get(s.date) ?? []), { start: s.start, end: s.end }])
  const [v, setV] = React.useState({ date: '', start: '10:00', end: '14:00' })
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  return (
    <Card>
      <CardHeader
        title="Special opening hours"
        description="Different hours on a specific date, like a late opening or a short day."
      />
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
              toast.success(r.message ?? 'Saved')
              setError(null)
              router.refresh()
            } else setError(r.error)
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date" htmlFor="sh-date">
              <Input
                type="date"
                value={v.date}
                onChange={(e) => setV({ ...v, date: e.target.value })}
                required
              />
            </Field>
            <Field label="Opens" htmlFor="sh-start">
              <Input
                type="time"
                step={300}
                value={v.start}
                onChange={(e) => setV({ ...v, start: e.target.value })}
              />
            </Field>
            <Field label="Closes" htmlFor="sh-end">
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
            <Sparkles /> Set special hours
          </Button>
        </form>
        {byDate.size === 0 ? (
          <p className="text-sm text-muted-foreground">No special hours coming up.</p>
        ) : (
          <ul className="divide-y divide-border">
            {[...byDate.entries()].map(([date, ranges]) => (
              <li key={date} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{formatPlainDate(date)}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {ranges
                      .map((r) => `${formatMinutesOfDay(r.start)} – ${formatMinutesOfDay(r.end)}`)
                      .join(', ')}
                  </p>
                </div>
                <RemoveButton
                  label={`Remove special hours on ${date}`}
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
  const router = useRouter()
  const list = p.blocks.filter((b) =>
    p.selectedStaffId ? b.staffId === p.selectedStaffId || b.staffId === null : true,
  )
  const [v, setV] = React.useState({ date: '', start: '12:00', end: '13:00', reason: '' })
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  return (
    <Card>
      <CardHeader
        title="Blocked time"
        description="Block part of a day — a meeting, an errand, a delivery. Existing bookings aren’t affected."
      />
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
              toast.success(r.message ?? 'Blocked')
              setError(null)
              router.refresh()
            } else setError(r.fields ? (Object.values(r.fields)[0] ?? r.error) : r.error)
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date" htmlFor="tb-date">
              <Input
                type="date"
                value={v.date}
                onChange={(e) => setV({ ...v, date: e.target.value })}
                required
              />
            </Field>
            <Field label="From" htmlFor="tb-start">
              <Input
                type="time"
                step={300}
                value={v.start}
                onChange={(e) => setV({ ...v, start: e.target.value })}
              />
            </Field>
            <Field label="Until" htmlFor="tb-end">
              <Input
                type="time"
                step={300}
                value={v.end}
                onChange={(e) => setV({ ...v, end: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Reason" htmlFor="tb-reason" optional>
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
            <Ban /> Block time{p.selectedStaffId ? '' : ' for everyone'}
          </Button>
        </form>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blocked time coming up.</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Clock4 className="size-4 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatDateTime(b.startsAt, p.timezone)} –{' '}
                    {new Intl.DateTimeFormat('en', {
                      timeZone: p.timezone,
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(new Date(b.endsAt))}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {b.reason || 'Blocked'}
                    {b.staffId === null ? ' · everyone' : ''}
                  </p>
                </div>
                <RemoveButton label="Remove block" run={() => removeTimeBlockAction(b.id)} />
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
          toast.success(r.message ?? 'Removed')
          router.refresh()
        } else toast.error(r.error ?? 'Failed')
      }}
    >
      <Trash2 />
    </Button>
  )
}
