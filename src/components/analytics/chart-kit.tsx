'use client'

import * as React from 'react'
import { BarChart3, Table2 } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Tracks an element's content width with ResizeObserver (state is only set from the observer callback). */
export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = React.useRef<T>(null)
  const [width, setWidth] = React.useState(fallback)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0)
      if (w > 0) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Clean, human axis ticks from 0 to ≥ max (1-2-2.5-5 steps). */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const rough = max / count
  const mag = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag
  const top = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

/** Integer-only ticks for counts (never "2.5 bookings"). */
export function countTicks(max: number, count = 4): number[] {
  const t = niceTicks(Math.max(max, 1), count)
  if (t.every((v) => Number.isInteger(v))) return t
  const step = Math.max(1, Math.ceil(max / count))
  const out: number[] = []
  for (let v = 0; v <= Math.ceil(max / step) * step; v += step) out.push(v)
  return out
}

/** Floating readout. Values lead (strong), labels follow (muted); series keyed by a short line stroke. */
export function ChartTooltip({
  x,
  y,
  containerWidth,
  title,
  rows,
  visible,
}: {
  x: number
  y: number
  containerWidth: number
  title: React.ReactNode
  rows: Array<{ key: string; color?: string; label: React.ReactNode; value: React.ReactNode }>
  visible: boolean
}) {
  const flip = x > containerWidth * 0.62
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute z-10 min-w-36 rounded-lg border border-border bg-elevated px-3 py-2 text-xs shadow-md transition-opacity duration-100',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      style={{
        left: x,
        top: y,
        transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
      }}
    >
      <p className="mb-1 font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2 whitespace-nowrap">
            {r.color && (
              <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
            )}
            <span className="tabular text-sm font-semibold text-foreground">{r.value}</span>
            <span className="text-muted-foreground">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Legend entry: the swatch mirrors the mark (rect for bars/areas, line for lines); text stays in ink. */
export function LegendItem({
  color,
  label,
  shape = 'rect',
}: {
  color: string
  label: React.ReactNode
  shape?: 'rect' | 'line'
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {shape === 'rect' ? (
        <span className="size-2.5 rounded-[3px]" style={{ background: color }} aria-hidden />
      ) : (
        <span className="h-0.5 w-3.5 rounded-full" style={{ background: color }} aria-hidden />
      )}
      {label}
    </span>
  )
}

/**
 * Card wrapper for every chart: title + question it answers, a chart/table
 * toggle (the table is the WCAG-clean equivalent of the chart), and an
 * optional footer summary.
 */
export function ChartCard({
  title,
  description,
  table,
  children,
  footer,
  className,
  headerExtra,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  table?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  headerExtra?: React.ReactNode
}) {
  const [showTable, setShowTable] = React.useState(false)
  const id = React.useId()
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader
        title={title}
        description={description}
        action={
          table ? (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-pressed={showTable}
              aria-controls={id}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showTable ? (
                <BarChart3 className="size-4" aria-hidden />
              ) : (
                <Table2 className="size-4" aria-hidden />
              )}
              <span>{showTable ? 'Chart' : 'Table'}</span>
            </button>
          ) : undefined
        }
      />
      {headerExtra}
      <CardBody id={id} className="flex-1">
        {showTable && table ? (
          <div className="relative max-h-96 overflow-auto rounded-lg border border-border">
            {table}
          </div>
        ) : (
          children
        )}
      </CardBody>
      {footer && (
        <div className="border-t border-border px-5 py-3 text-[13px] text-muted-foreground">
          {footer}
        </div>
      )}
    </Card>
  )
}

/** Simple data table used as the chart alternative. */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string
  columns: Array<{ key: string; label: string; numeric?: boolean }>
  rows: Array<Record<string, React.ReactNode>>
}) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="sticky top-0 bg-surface-2 text-xs text-muted-foreground">
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              scope="col"
              className={cn(
                'px-3 py-2 font-medium whitespace-nowrap',
                c.numeric ? 'text-right' : 'text-left',
              )}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border">
            {columns.map((c, j) =>
              j === 0 ? (
                <th
                  key={c.key}
                  scope="row"
                  className="px-3 py-1.5 text-left font-normal whitespace-nowrap"
                >
                  {r[c.key]}
                </th>
              ) : (
                <td
                  key={c.key}
                  className={cn('px-3 py-1.5 whitespace-nowrap', c.numeric && 'tabular text-right')}
                >
                  {r[c.key]}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Path for a column with 4px rounded data-end and a square baseline. */
export function columnPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0 || w <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

/** Path for a horizontal bar with 4px rounded data-end (right) and a square baseline (left). */
export function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0 || w <= 0) return ''
  const rr = Math.min(r, h / 2, w)
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`
}
