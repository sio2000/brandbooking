'use client'

import * as React from 'react'
import { formatPlainDate } from '@/lib/format'
import { ChartTooltip, columnPath, countTicks, niceTicks, useElementWidth } from './chart-kit'

export type Series = { key: string; label: string; color: string }
export type TimePoint = { bucket: string; values: Record<string, number> }

const TOP = 20
const BOTTOM = 26
const RIGHT = 8
const GAP = 2

function bucketLabel(bucket: string, unit: 'day' | 'week', long = false) {
  if (unit === 'week') return `${long ? 'Week of ' : ''}${formatPlainDate(bucket, undefined, { day: 'numeric', month: 'short' })}`
  return formatPlainDate(bucket, undefined, long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' })
}

/**
 * Hand-written SVG time chart. `stack` renders thin columns (stacked with a 2px
 * surface gap when there are two series); `area` renders a 2px line over a 10%
 * wash. One y-axis only. Hover/focus snaps to the nearest bucket and shows a
 * readout for every series; arrow keys walk the buckets.
 */
export function TimeSeriesChart({
  points,
  series,
  unit,
  mode,
  ariaLabel,
  formatValue,
  formatTick,
  integer,
  height = 240,
}: {
  points: TimePoint[]
  series: Series[]
  unit: 'day' | 'week'
  mode: 'stack' | 'area'
  ariaLabel: string
  formatValue: (v: number) => string
  formatTick?: (v: number) => string
  integer?: boolean
  height?: number
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>(720)
  const [active, setActive] = React.useState<number | null>(null)
  const n = points.length
  const totals = points.map((p) => (mode === 'stack' ? series.reduce((s, x) => s + (p.values[x.key] ?? 0), 0) : Math.max(...series.map((x) => p.values[x.key] ?? 0))))
  const max = Math.max(0, ...totals)
  const ticks = integer ? countTicks(max) : niceTicks(max)
  const top = ticks[ticks.length - 1] || 1
  const tickText = (v: number) => (formatTick ?? formatValue)(v)
  const left = Math.max(28, Math.max(...ticks.map((t) => tickText(t).length)) * 6.6 + 10)
  const plotW = Math.max(40, width - left - RIGHT)
  const plotH = height - TOP - BOTTOM
  const band = plotW / Math.max(n, 1)
  const barW = Math.max(1, Math.min(24, band - Math.max(GAP, band * 0.3)))
  const y = (v: number) => TOP + plotH - (v / top) * plotH
  const cx = (i: number) => left + band * (i + 0.5)
  const labelEvery = Math.max(1, Math.ceil(64 / band))
  const peakIdx = totals.reduce((best, v, i) => (v > (totals[best] ?? -1) ? i : best), 0)

  const indexAt = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - left
    return Math.min(n - 1, Math.max(0, Math.floor(px / band)))
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!n) return
    const cur = active ?? n - 1
    let next = cur
    if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1)
    else if (e.key === 'ArrowRight') next = Math.min(n - 1, cur + 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if (e.key === 'Escape') return setActive(null)
    else return
    e.preventDefault()
    setActive(next)
  }

  const activePoint = active !== null ? points[active] : null
  const readout = activePoint
    ? `${bucketLabel(activePoint.bucket, unit, true)}: ${series.map((s) => `${formatValue(activePoint.values[s.key] ?? 0)} ${s.label.toLowerCase()}`).join(', ')}`
    : ''

  // Area geometry.
  const linePath = (key: string) => points.map((p, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${y(p.values[key] ?? 0).toFixed(1)}`).join('')
  const areaPath = (key: string) => (n ? `${linePath(key)}L${cx(n - 1).toFixed(1)},${TOP + plotH}L${cx(0).toFixed(1)},${TOP + plotH}Z` : '')

  return (
    <div
      ref={ref}
      className="relative w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      tabIndex={0}
      role="group"
      aria-roledescription="chart"
      aria-label={`${ariaLabel} Use the left and right arrow keys to read values.`}
      onKeyDown={onKey}
      onFocus={() => setActive((a) => a ?? n - 1)}
      onBlur={() => setActive(null)}
    >
      <svg role="img" aria-label={ariaLabel} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible">
        {/* Grid + y-axis ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular" fontSize={11} fill="var(--chart-axis)">
              {tickText(t)}
            </text>
          </g>
        ))}
        {/* Hover band */}
        {active !== null && mode === 'stack' && <rect x={left + band * active} y={TOP} width={band} height={plotH} fill="var(--chart-grid)" opacity={0.55} />}

        {mode === 'stack' &&
          points.map((p, i) => {
            let base = TOP + plotH
            const x = cx(i) - barW / 2
            const present = series.filter((s) => (p.values[s.key] ?? 0) > 0)
            return (
              <g key={p.bucket}>
                {present.map((s, j) => {
                  const v = p.values[s.key] ?? 0
                  const h = (v / top) * plotH - (j > 0 ? GAP : 0)
                  const yTop = base - (j > 0 ? GAP : 0) - Math.max(h, 0)
                  const isTop = j === present.length - 1
                  const d = isTop ? columnPath(x, yTop, barW, Math.max(h, 1), barW >= 6 ? 4 : barW / 2) : `M${x},${yTop}h${barW}v${Math.max(h, 0)}h${-barW}Z`
                  base = yTop
                  return <path key={s.key} d={d} fill={s.color} />
                })}
              </g>
            )
          })}

        {mode === 'area' &&
          series.map((s) => (
            <g key={s.key}>
              <path d={areaPath(s.key)} fill={s.color} opacity={0.1} />
              <path d={linePath(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}

        {/* Baseline */}
        <line x1={left} x2={left + plotW} y1={TOP + plotH} y2={TOP + plotH} stroke="var(--chart-axis)" strokeOpacity={0.5} strokeWidth={1} shapeRendering="crispEdges" />

        {/* Selective direct label: the peak only */}
        {max > 0 && active === null && (
          <text
            x={Math.min(Math.max(cx(peakIdx), left + 16), left + plotW - 16)}
            y={(mode === 'stack' ? y(totals[peakIdx] ?? 0) : y(totals[peakIdx] ?? 0)) - 6}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="var(--muted-foreground)"
            className="tabular"
          >
            {formatValue(totals[peakIdx] ?? 0)}
          </text>
        )}

        {/* Crosshair for area */}
        {mode === 'area' && activePoint && active !== null && (
          <g>
            <line x1={cx(active)} x2={cx(active)} y1={TOP} y2={TOP + plotH} stroke="var(--chart-axis)" strokeWidth={1} shapeRendering="crispEdges" />
            {series.map((s) => (
              <circle key={s.key} cx={cx(active)} cy={y(activePoint.values[s.key] ?? 0)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}

        {/* X labels */}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.bucket} x={cx(i)} y={TOP + plotH + 17} textAnchor={n === 1 ? 'middle' : i === 0 && band < 30 ? 'start' : 'middle'} fontSize={11} fill="var(--chart-axis)">
              {bucketLabel(p.bucket, unit)}
            </text>
          ) : null,
        )}

        {/* Hit layer: the whole plot, snapping to the nearest bucket */}
        <rect
          x={left}
          y={TOP}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={(e) => setActive(indexAt(e.clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect()))}
          onPointerLeave={() => setActive(null)}
        />
      </svg>
      {activePoint && active !== null && (
        <ChartTooltip
          visible
          x={cx(active)}
          y={TOP + plotH / 2}
          containerWidth={width}
          title={bucketLabel(activePoint.bucket, unit, true)}
          rows={[...series].reverse().map((s) => ({ key: s.key, color: s.color, label: s.label, value: formatValue(activePoint.values[s.key] ?? 0) }))}
        />
      )}
      <p className="sr-only" aria-live="polite">
        {readout}
      </p>
    </div>
  )
}
