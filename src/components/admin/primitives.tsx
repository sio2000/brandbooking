import { AlertTriangle, CheckCircle2, CircleSlash, Clock, PauseCircle, XCircle } from 'lucide-react'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Server-safe building blocks shared by the admin pages. Platform views are
 * always rendered in UTC so operators in different regions see the same time.
 */

export const ADMIN_TZ = 'UTC'

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  eyebrow?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold text-balance break-words sm:text-[1.7rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-pretty text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A <time> element in UTC with the exact timestamp as a tooltip. */
export function UtcTime({
  value,
  mode = 'datetime',
  className,
}: {
  value: Date | string | null | undefined
  mode?: 'datetime' | 'date' | 'relative'
  className?: string
}) {
  if (!value) return <span className="text-subtle-foreground">—</span>
  const d = value instanceof Date ? value : new Date(value)
  const exact = `${formatDateTime(d, ADMIN_TZ)} UTC`
  const text =
    mode === 'date'
      ? formatDate(d, ADMIN_TZ)
      : mode === 'relative'
        ? formatRelative(d)
        : `${formatDateTime(d, ADMIN_TZ)}`
  return (
    <time
      dateTime={d.toISOString()}
      title={exact}
      className={cn('tabular whitespace-nowrap', className)}
    >
      {text}
    </time>
  )
}

/** Whether a timestamp lies in the future (server-rendered, so evaluated per request). */
export function isFuture(d: Date | string | null | undefined): boolean {
  return Boolean(d) && new Date(d!).getTime() > Date.now()
}

export type Tone = 'ok' | 'warning' | 'danger' | 'neutral'

/** Status indicator that never relies on colour alone: icon + text. */
export function StatusText({
  tone,
  children,
  className,
}: {
  tone: Tone
  children: React.ReactNode
  className?: string
}) {
  const Icon =
    tone === 'ok'
      ? CheckCircle2
      : tone === 'warning'
        ? AlertTriangle
        : tone === 'danger'
          ? XCircle
          : CircleSlash
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[13px] font-medium',
        tone === 'ok' && 'text-success',
        tone === 'warning' && 'text-warning',
        tone === 'danger' && 'text-danger',
        tone === 'neutral' && 'text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  )
}

export function Kpi({
  label,
  value,
  hint,
  tone,
  toneLabel,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: Tone
  toneLabel?: string
  className?: string
}) {
  return (
    <Card
      className={cn(
        'flex min-w-0 flex-col gap-1 p-4',
        tone === 'warning' && 'border-warning/40 bg-warning-soft/40',
        tone === 'danger' && 'border-danger/40 bg-danger-soft/40',
        className,
      )}
    >
      <dt className="text-[13px] leading-snug text-muted-foreground">{label}</dt>
      <dd className="tabular font-display text-2xl leading-tight font-semibold tracking-tight break-words">
        {value}
      </dd>
      {(hint || (tone && toneLabel)) && (
        <dd className="mt-0.5 text-xs text-muted-foreground">
          {tone && toneLabel ? (
            <StatusText tone={tone} className="text-xs">
              {toneLabel}
            </StatusText>
          ) : (
            hint
          )}
        </dd>
      )}
    </Card>
  )
}

export function BusinessStatusBadge({ status }: { status: string }) {
  return status === 'suspended' ? (
    <Badge tone="danger">
      <PauseCircle aria-hidden />
      Suspended
    </Badge>
  ) : (
    <Badge tone="success">
      <CheckCircle2 aria-hidden />
      Active
    </Badge>
  )
}

const publishLabels: Record<string, { label: string; tone: 'success' | 'neutral' | 'warning' }> = {
  published: { label: 'Published', tone: 'success' },
  draft: { label: 'Draft', tone: 'neutral' },
  paused: { label: 'Paused', tone: 'warning' },
}

export function PublishBadge({ status }: { status: string }) {
  const p = publishLabels[status] ?? { label: status, tone: 'neutral' as const }
  return <Badge tone={p.tone}>{p.label}</Badge>
}

const subLabels: Record<
  string,
  { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' | 'info' }
> = {
  active: { label: 'Active', tone: 'success' },
  trialing: { label: 'Trialing', tone: 'info' },
  past_due: { label: 'Past due', tone: 'warning' },
  unpaid: { label: 'Unpaid', tone: 'danger' },
  canceled: { label: 'Canceled', tone: 'neutral' },
  incomplete: { label: 'Incomplete', tone: 'warning' },
  incomplete_expired: { label: 'Expired', tone: 'neutral' },
  paused: { label: 'Paused', tone: 'neutral' },
}

/** Subscription status; falls back to the in-app free trial or "None". */
export function SubscriptionBadge({
  status,
  trialEndsAt,
}: {
  status: string | null | undefined
  trialEndsAt?: Date | string | null
}) {
  if (status) {
    const s = subLabels[status] ?? { label: status, tone: 'neutral' as const }
    return (
      <Badge tone={s.tone}>
        {s.tone === 'warning' || s.tone === 'danger' ? <AlertTriangle aria-hidden /> : null}
        {s.label}
      </Badge>
    )
  }
  if (isFuture(trialEndsAt)) {
    return (
      <Badge tone="info">
        <Clock aria-hidden />
        Trial
      </Badge>
    )
  }
  return <Badge tone="neutral">None</Badge>
}

export function ActorBadge({ actor }: { actor: string }) {
  const tone =
    actor === 'admin'
      ? 'accent'
      : actor === 'system' || actor === 'stripe'
        ? 'info'
        : actor === 'customer'
          ? 'neutral'
          : 'primary'
  return (
    <Badge tone={tone} className="capitalize">
      {actor}
    </Badge>
  )
}

/** Definition list for "label: value" detail rows. */
export function DetailList({
  items,
  className,
}: {
  items: Array<{ label: React.ReactNode; value: React.ReactNode }>
  className?: string
}) {
  return (
    <dl
      className={cn('grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]', className)}
    >
      {items.map((it, i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{it.label}</dt>
          <dd className="-mt-2.5 min-w-0 break-words sm:mt-0">{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Horizontally scrollable, bordered table wrapper with consistent cell styles. */
export function TableWrap({
  children,
  className,
  minWidth = 'min-w-[40rem]',
}: {
  children: React.ReactNode
  className?: string
  minWidth?: string
}) {
  return (
    // Focusable so keyboard users can scroll wide tables on small screens.
    <div
      role="region"
      aria-label="Scrollable table"
      tabIndex={0}
      className={cn(
        'scrollbar-thin overflow-x-auto focus-visible:outline-offset-[-2px]',
        className,
      )}
    >
      <table
        className={cn(
          'w-full border-collapse text-left text-sm [&_tbody_th]:text-left [&_tbody_th]:font-normal [&_tbody>tr>*]:border-t [&_tbody>tr>*]:border-border [&_tbody>tr>*]:px-4 [&_tbody>tr>*]:py-3 [&_tbody>tr>*]:align-top [&_thead]:bg-surface-2/60 [&_thead_th]:px-4 [&_thead_th]:py-2.5 [&_thead_th]:text-xs [&_thead_th]:font-medium [&_thead_th]:whitespace-nowrap [&_thead_th]:text-muted-foreground',
          minWidth,
        )}
      >
        {children}
      </table>
    </div>
  )
}

/** Email addresses can appear in provider error strings: redact them (no PII in admin). */
export function redactPII(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[A-Za-z]{2,}/g, '[redacted email]')
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <code
      className={cn(
        'rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] break-all',
        className,
      )}
    >
      {children}
    </code>
  )
}
