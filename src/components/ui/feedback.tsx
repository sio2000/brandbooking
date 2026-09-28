import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

const tones = {
  info: { cls: 'border-info/20 bg-info-soft text-info-soft-foreground', Icon: Info },
  success: { cls: 'border-success/20 bg-success-soft text-success-soft-foreground', Icon: CheckCircle2 },
  warning: { cls: 'border-warning/25 bg-warning-soft text-warning-soft-foreground', Icon: AlertTriangle },
  danger: { cls: 'border-danger/25 bg-danger-soft text-danger-soft-foreground', Icon: XCircle },
} as const

export function Alert({ tone = 'info', title, children, action, className }: { tone?: keyof typeof tones; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  const { cls, Icon } = tones[tone]
  return (
    <div role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn('leading-relaxed', title && 'mt-0.5 opacity-90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  )
}

/** Intentional empty state: says what this is, and what to do next. */
export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: React.ComponentType<{ className?: string }>; title: string; description: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="relative mb-4">
          <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary-soft/60 blur-xl" aria-hidden />
          <div className="grid size-12 place-items-center rounded-2xl border border-border bg-surface shadow-sm">
            <Icon className="size-5 text-primary" />
          </div>
        </div>
      )}
      <h3 className="font-sans text-base font-semibold tracking-normal">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span role="status" aria-label="Loading" className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)} />
}

export function ProgressBar({ value, className, label }: { value: number; className?: string; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-[var(--ease-out-soft)]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}
