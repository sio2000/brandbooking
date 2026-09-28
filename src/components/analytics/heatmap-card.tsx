'use client'

import * as React from 'react'
import { formatMinutesOfDay, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ChartCard, ChartTooltip, useElementWidth } from './chart-kit'
import { hourLabel, WEEKDAYS_LONG, WEEKDAYS_SHORT } from './presets'

type Cell = { dow: number; hour: number; bookings: number; cancelled: number }

/** Sequential single-hue scale from --primary; empty cells sit one step off the surface. */
function cellColor(v: number, max: number) {
  if (v <= 0 || max <= 0) return 'var(--surface-2)'
  const pct = Math.round(14 + 86 * (v / max))
  return `color-mix(in oklab, var(--primary) ${pct}%, var(--surface))`
}

function slot(hour: number) {
  return `${formatMinutesOfDay(hour * 60)}–${formatMinutesOfDay(((hour + 1) % 24) * 60)}`
}

export function HeatmapCard({ cells }: { cells: Cell[] }) {
  const active = cells.filter((c) => c.bookings > 0)
  const minH = active.length ? Math.min(...active.map((c) => c.hour)) : 9
  const maxH = active.length ? Math.max(...active.map((c) => c.hour)) : 17
  const hours = Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i)
  const grid = new Map(cells.map((c) => [`${c.dow}|${c.hour}`, c]))
  const value = (dow: number, hour: number) => grid.get(`${dow}|${hour}`)?.bookings ?? 0
  const max = Math.max(0, ...cells.map((c) => c.bookings))
  const busiest = [...active].sort((a, b) => b.bookings - a.bookings)[0]
  const byDay = WEEKDAYS_LONG.map((_, i) =>
    cells.filter((c) => c.dow === i + 1).reduce((s, c) => s + c.bookings, 0),
  )
  const busiestDayIdx = byDay.indexOf(Math.max(...byDay))
  const headline = busiest
    ? `Busiest: ${WEEKDAYS_LONG[busiest.dow - 1]} ${slot(busiest.hour)} (${busiest.bookings} bookings).`
    : 'No bookings in this period.'
  const sub = busiest
    ? `Busiest day overall: ${WEEKDAYS_LONG[busiestDayIdx]} (${formatNumber(byDay[busiestDayIdx] ?? 0)} bookings).`
    : ''
  const summary = `${headline} ${sub}`.trim()

  const [ref, width] = useElementWidth<HTMLDivElement>(640)
  const [hover, setHover] = React.useState<{ r: number; c: number } | null>(null)
  const [focusPos, setFocusPos] = React.useState({ r: 0, c: 0 })
  const cellRefs = React.useRef<Array<HTMLDivElement | null>>([])

  const labelW = 40
  const cellW = (width - labelW) / Math.max(hours.length, 1)
  const labelEvery = cellW >= 34 ? 1 : cellW >= 17 ? 2 : 3
  const cellH = cellW < 26 ? 24 : 30

  const onKey = (e: React.KeyboardEvent) => {
    let { r, c } = focusPos
    if (e.key === 'ArrowRight') c = Math.min(hours.length - 1, c + 1)
    else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1)
    else if (e.key === 'ArrowDown') r = Math.min(6, r + 1)
    else if (e.key === 'ArrowUp') r = Math.max(0, r - 1)
    else if (e.key === 'Home') c = 0
    else if (e.key === 'End') c = hours.length - 1
    else return
    e.preventDefault()
    setFocusPos({ r, c })
    setHover({ r, c })
    cellRefs.current[r * hours.length + c]?.focus()
  }

  const hv = hover ? { dow: hover.r + 1, hour: hours[hover.c]! } : null
  const hvCell = hv ? grid.get(`${hv.dow}|${hv.hour}`) : undefined

  return (
    <ChartCard
      title="Busiest days & times"
      description="When do customers come in? Scheduled appointments by weekday and start hour (business time)."
      footer={
        <span>
          <span className="font-medium text-foreground">{headline}</span> {sub}
        </span>
      }
      table={
        <table className="w-full text-sm">
          <caption className="sr-only">Bookings by weekday and hour</caption>
          <thead className="sticky top-0 bg-surface-2 text-xs text-muted-foreground">
            <tr>
              <th
                scope="col"
                className="sticky left-0 bg-surface-2 px-3 py-2 text-left font-medium"
              >
                Day
              </th>
              {hours.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-2 py-2 text-right font-medium whitespace-nowrap"
                >
                  {hourLabel(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS_LONG.map((d, r) => (
              <tr key={d} className="border-t border-border">
                <th
                  scope="row"
                  className="sticky left-0 bg-surface px-3 py-1.5 text-left font-normal"
                >
                  {d}
                </th>
                {hours.map((h) => (
                  <td key={h} className="tabular px-2 py-1.5 text-right">
                    {value(r + 1, h) || <span className="text-subtle-foreground">·</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
        <div
          role="grid"
          aria-label={`Bookings by weekday and hour. ${summary}`}
          onKeyDown={onKey}
          className="grid gap-[2px]"
          style={{ gridTemplateColumns: `${labelW - 2}px repeat(${hours.length}, minmax(0, 1fr))` }}
        >
          <div role="row" className="contents">
            <div role="columnheader" />
            {hours.map((h, c) => (
              <div
                key={h}
                role="columnheader"
                aria-label={hourLabel(h)}
                className="tabular flex justify-center overflow-visible pb-1 text-[11px] whitespace-nowrap text-[var(--chart-axis)]"
              >
                {c % labelEvery === 0 ? hourLabel(h) : ''}
              </div>
            ))}
          </div>
          {WEEKDAYS_SHORT.map((d, r) => (
            <div role="row" key={d} className="contents">
              <div
                role="rowheader"
                aria-label={WEEKDAYS_LONG[r]}
                className="flex items-center text-xs text-muted-foreground"
                style={{ height: cellH }}
              >
                {d}
              </div>
              {hours.map((h, c) => {
                const v = value(r + 1, h)
                const isHover = hover?.r === r && hover.c === c
                return (
                  <div
                    key={h}
                    role="gridcell"
                    ref={(el) => {
                      cellRefs.current[r * hours.length + c] = el
                    }}
                    tabIndex={focusPos.r === r && focusPos.c === c ? 0 : -1}
                    aria-label={`${WEEKDAYS_LONG[r]} ${slot(h)}: ${v} ${v === 1 ? 'booking' : 'bookings'}`}
                    onPointerEnter={() => setHover({ r, c })}
                    onFocus={() => {
                      setFocusPos({ r, c })
                      setHover({ r, c })
                    }}
                    onBlur={() => setHover(null)}
                    className={cn(
                      'rounded-[4px] transition-[box-shadow] duration-100 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isHover && 'ring-2 ring-foreground/70',
                    )}
                    style={{ height: cellH, background: cellColor(v, max) }}
                  />
                )
              })}
            </div>
          ))}
        </div>
        {hv && hover && (
          <ChartTooltip
            visible
            x={labelW + cellW * (hover.c + 0.5)}
            y={20 + cellH * (hover.r + 0.5) + 2 * hover.r}
            containerWidth={width}
            title={`${WEEKDAYS_LONG[hv.dow - 1]} ${slot(hv.hour)}`}
            rows={[
              {
                key: 'b',
                label: (hvCell?.bookings ?? 0) === 1 ? 'booking' : 'bookings',
                value: formatNumber(hvCell?.bookings ?? 0),
              },
              ...((hvCell?.cancelled ?? 0) > 0
                ? [{ key: 'c', label: 'cancelled', value: formatNumber(hvCell!.cancelled) }]
                : []),
            ]}
          />
        )}
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground" aria-hidden>
          <span>Fewer</span>
          <span
            className="h-2.5 w-28 rounded-full"
            style={{
              background:
                'linear-gradient(90deg, color-mix(in oklab, var(--primary) 14%, var(--surface)), var(--primary))',
            }}
          />
          <span>More</span>
          <span className="tabular ml-auto">Max {formatNumber(max)} per slot</span>
        </div>
      </div>
    </ChartCard>
  )
}
