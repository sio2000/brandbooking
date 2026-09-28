import * as React from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/menu'
import { Info } from 'lucide-react'

/** KPI tile: label, big tabular number, optional delta vs previous period and definition tooltip. */
export function Stat({
  label,
  value,
  hint,
  delta,
  deltaGoodWhen = 'up',
  definition,
  icon: Icon,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  delta?: number | null
  deltaGoodWhen?: 'up' | 'down'
  definition?: string
  icon?: React.ComponentType<{ className?: string }>
  className?: string
}) {
  const showDelta = delta !== undefined && delta !== null && Number.isFinite(delta)
  const up = (delta ?? 0) > 0.005
  const down = (delta ?? 0) < -0.005
  const good = (up && deltaGoodWhen === 'up') || (down && deltaGoodWhen === 'down')
  const bad = (down && deltaGoodWhen === 'up') || (up && deltaGoodWhen === 'down')
  return (
    <div
      className={cn('rounded-xl border border-border bg-surface p-4 shadow-xs sm:p-5', className)}
    >
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        {Icon && <Icon className="size-4" />}
        <span>{label}</span>
        {definition && (
          <Tooltip content={definition}>
            <button
              type="button"
              className="rounded text-subtle-foreground hover:text-foreground"
              aria-label={`About ${label}`}
            >
              <Info className="size-3.5" />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="tabular min-w-0 font-display text-[1.6rem] leading-none font-bold break-words sm:text-[1.75rem]">
          {value}
        </span>
        {showDelta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold',
              good && 'bg-success-soft text-success-soft-foreground',
              bad && 'bg-danger-soft text-danger-soft-foreground',
              !good && !bad && 'bg-surface-2 text-muted-foreground',
            )}
          >
            {up ? (
              <ArrowUpRight className="size-3" aria-hidden />
            ) : down ? (
              <ArrowDownRight className="size-3" aria-hidden />
            ) : (
              <Minus className="size-3" aria-hidden />
            )}
            <span className="sr-only">{up ? 'up' : down ? 'down' : 'unchanged'}</span>
            {Math.abs(Math.round((delta ?? 0) * 100))}%
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
