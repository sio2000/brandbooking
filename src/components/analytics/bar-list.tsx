import * as React from 'react'
import { cn } from '@/lib/utils'

export type BarListItem = {
  key: string
  label: React.ReactNode
  value: number
  /** Primary readout shown at the bar tip (text ink, never the bar colour). */
  display: React.ReactNode
  /** Secondary readout (muted). */
  detail?: React.ReactNode
}

/**
 * Horizontal bar list: label on its own line, a thin bar (10px, 4px rounded
 * data-end, square baseline) and the value directly labelled. Every value is
 * visible, so no tooltip is needed to read it. One series → one colour.
 */
export function BarList({
  items,
  max,
  color = 'var(--primary)',
  ariaLabel,
  className,
}: {
  items: BarListItem[]
  max?: number
  color?: string
  ariaLabel: string
  className?: string
}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <ul aria-label={ariaLabel} className={cn('space-y-3', className)}>
      {items.map((i) => {
        const pct = top > 0 ? Math.max(0, Math.min(100, (i.value / top) * 100)) : 0
        return (
          <li key={i.key} className="group">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{i.label}</span>
              <span className="tabular shrink-0 text-end">
                <span className="font-semibold">{i.display}</span>
                {i.detail && (
                  <span className="ms-1.5 text-xs text-muted-foreground">{i.detail}</span>
                )}
              </span>
            </div>
            <div className="mt-1.5 h-2.5 w-full" aria-hidden>
              <div
                className="h-full rounded-e-[4px] transition-[filter] duration-150 group-hover:brightness-110"
                style={{ width: i.value > 0 ? `max(${pct}%, 3px)` : 0, background: color }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
