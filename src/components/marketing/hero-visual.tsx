'use client'

import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
import { BellRing, Check, Clock3 } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

type Block = { col: 0 | 1; start: number; mins: number; title: string; who: string; color: string }

const DAY_START = 9
const DAY_HOURS = 8
const staff = ['Anna', 'Leo'] as const

const existing: Block[] = [
  { col: 0, start: 9, mins: 75, title: 'Colour refresh', who: 'Maya R.', color: 'var(--chart-3)' },
  { col: 0, start: 11, mins: 45, title: 'Cut & finish', who: 'Jonas K.', color: 'var(--chart-1)' },
  { col: 0, start: 14.5, mins: 60, title: 'Balayage', who: 'Ines T.', color: 'var(--chart-4)' },
  { col: 1, start: 9.5, mins: 30, title: 'Beard trim', who: 'Sam O.', color: 'var(--chart-2)' },
  { col: 1, start: 11.25, mins: 60, title: 'Colour consult', who: 'Elena P.', color: 'var(--chart-5)' },
  { col: 1, start: 15.5, mins: 45, title: 'Cut & finish', who: 'Priya D.', color: 'var(--chart-1)' },
]
const incoming: Block = { col: 1, start: 13.5, mins: 45, title: 'Cut & finish', who: 'Alex M.', color: 'var(--chart-1)' }
const slots = ['10:15', '12:15', '13:30', '14:15', '16:15', '16:45']
const PICK = '13:30'

/** Phase 0: browsing slots · 1: a slot is picked · 2: booked and in the calendar. */
const phaseMs = [2000, 1300, 3800]
const ease = [0.22, 1, 0.36, 1] as const

function blockStyle(b: Block): React.CSSProperties {
  return {
    top: `${((b.start - DAY_START) / DAY_HOURS) * 100}%`,
    height: `${(b.mins / 60 / DAY_HOURS) * 100}%`,
    ['--c' as string]: b.color,
  } as React.CSSProperties
}

function CalendarBlock({ b, highlight }: { b: Block; highlight?: boolean }) {
  return (
    <div
      className={cn(
        'absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] border-(--c) bg-[color-mix(in_oklab,var(--c)_13%,var(--surface))] px-1.5 py-1 sm:px-2',
        highlight && 'ring-2 ring-(--c)/40',
      )}
      style={blockStyle(b)}
    >
      <p className="truncate text-[10px] leading-tight font-semibold text-foreground sm:text-[11px]">{b.title}</p>
      {b.mins >= 45 && <p className="truncate text-[9.5px] leading-tight text-muted-foreground sm:text-[10.5px]">{b.who}</p>}
    </div>
  )
}

/**
 * Hero vignette: a customer picks a time on a booking page, and the
 * appointment lands in the business calendar. Decorative (aria-hidden);
 * loops only while visible and shows the final state for reduced motion.
 */
export function HeroVisual({ className }: { className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-10% 0px -10% 0px' })
  const reduce = useReducedMotion()
  const [phase, setPhase] = React.useState(0)

  React.useEffect(() => {
    // Reduced motion: settle on the final "booked" frame instead of looping.
    // (Decided here, not during render, so server and client markup match.)
    if (reduce) {
      if (phase === 2) return
      const id = window.setTimeout(() => setPhase(2), 0)
      return () => window.clearTimeout(id)
    }
    if (!inView) return
    const id = window.setTimeout(() => setPhase((p) => (p + 1) % 3), phaseMs[phase])
    return () => window.clearTimeout(id)
  }, [phase, reduce, inView])

  const p = phase
  const booked = p === 2

  return (
    <div ref={ref} aria-hidden className={cn('relative mx-auto w-full max-w-[560px] pb-14 select-none sm:pb-16', className)}>
      {/* Soft light behind the cards */}
      <div className="absolute top-8 right-4 -z-10 size-64 rounded-full bg-primary/20 blur-3xl sm:size-80" />
      <div className="absolute bottom-0 left-4 -z-10 size-56 rounded-full bg-accent/20 blur-3xl" />

      {/* Business calendar */}
      <div className="relative ml-auto w-[94%] rounded-2xl border border-border bg-surface shadow-lg sm:w-[86%]">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-3 sm:px-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">Calendar</p>
            <p className="truncate font-display text-[15px] font-bold tracking-tight sm:text-base">Thursday</p>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-surface-2 p-0.5 text-[10.5px] font-medium sm:text-[11px]">
            <span className="rounded-md bg-surface px-2 py-1 shadow-xs">Day</span>
            <span className="px-2 py-1 text-muted-foreground">Week</span>
          </div>
        </div>
        <div className="grid grid-cols-[34px_1fr_1fr] border-b border-border text-[10.5px] font-semibold text-muted-foreground sm:grid-cols-[40px_1fr_1fr] sm:text-[11px]">
          <span />
          {staff.map((s, i) => (
            <span key={s} className="flex items-center gap-1.5 border-l border-border px-2 py-2">
              <span className={cn('grid size-4 place-items-center rounded-full text-[8.5px] font-bold', i === 0 ? 'bg-accent-soft text-accent-soft-foreground' : 'bg-primary-soft text-primary-soft-foreground')}>
                {s[0]}
              </span>
              {s}
            </span>
          ))}
        </div>
        <div className="relative grid h-[250px] grid-cols-[34px_1fr_1fr] min-[400px]:h-[290px] sm:h-[330px] sm:grid-cols-[40px_1fr_1fr]">
          {/* Hour rows */}
          <div className="relative">
            {Array.from({ length: DAY_HOURS }, (_, i) => (
              <span key={i} className="tabular absolute right-1.5 -translate-y-1/2 text-[9.5px] text-subtle-foreground sm:text-[10px]" style={{ top: `${(i / DAY_HOURS) * 100}%` }}>
                {i === 0 ? '' : `${DAY_START + i}:00`}
              </span>
            ))}
          </div>
          {[0, 1].map((col) => (
            <div key={col} className="relative border-l border-border">
              {Array.from({ length: DAY_HOURS - 1 }, (_, i) => (
                <span key={i} className="absolute inset-x-0 border-t border-dashed border-border/80" style={{ top: `${((i + 1) / DAY_HOURS) * 100}%` }} />
              ))}
              {existing
                .filter((b) => b.col === col)
                .map((b) => (
                  <CalendarBlock key={b.title + b.start} b={b} />
                ))}
              {col === incoming.col && (
                <AnimatePresence>
                  {booked && (
                    <motion.div
                      key="incoming"
                      className="absolute inset-0"
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.45, ease }}
                    >
                      <CalendarBlock b={incoming} highlight />
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          ))}
          {/* Now line */}
          <div className="pointer-events-none absolute right-0 left-[34px] sm:left-[40px]" style={{ top: `${((12.6 - DAY_START) / DAY_HOURS) * 100}%` }}>
            <div className="relative h-px bg-accent">
              <span className="absolute -top-[3px] -left-[3px] size-[7px] rounded-full bg-accent" />
            </div>
          </div>
        </div>
      </div>

      {/* New-booking notification */}
      <AnimatePresence>
        {booked && (
          <motion.div
            key="toast"
            className="absolute right-0 bottom-3 flex max-w-[44%] items-center gap-2 rounded-xl border border-border bg-elevated py-2 pr-3 pl-2 shadow-md min-[400px]:max-w-[46%] sm:-right-4 sm:bottom-2 sm:max-w-none sm:gap-2.5 sm:pr-3.5 sm:pl-2.5"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4, ease, delay: reduce ? 0 : 0.25 }}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary sm:size-8">
              <BellRing className="size-3.5 sm:size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold sm:text-[12px]">New booking</span>
              <span className="block truncate text-[10px] text-muted-foreground sm:text-[11px]">
                <span className="hidden sm:inline">Cut & finish · </span>Thu {PICK} · Leo
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Customer's booking page */}
      <div className="absolute bottom-0 left-0 w-[54%] max-w-[236px] rounded-[1.4rem] border border-border bg-surface p-1.5 shadow-lg min-[400px]:w-[50%] sm:rotate-[-2deg]">
        <div className="rounded-[1.05rem] border border-border/70 bg-background px-2.5 pt-2.5 pb-3 sm:px-3 sm:pt-3">
          <div className="flex items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[9px] font-bold text-accent-soft-foreground sm:size-7 sm:text-[10px]">SL</span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold sm:text-xs">Studio Linden</span>
              <span className="block truncate text-[9.5px] text-muted-foreground sm:text-[10px]">Book online</span>
            </span>
          </div>
          <div className="mt-2.5 rounded-lg border border-border bg-surface px-2 py-1.5">
            <p className="truncate text-[10.5px] font-semibold sm:text-[11px]">Cut & finish</p>
            <p className="flex items-center gap-1 text-[9.5px] text-muted-foreground sm:text-[10px]">
              <Clock3 className="size-2.5" /> 45 min · €38
            </p>
          </div>
          <div className="relative mt-2.5 h-[118px] sm:h-[128px]">
            <AnimatePresence initial={false} mode="wait">
              {!booked ? (
                <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  <p className="text-[10px] font-semibold text-muted-foreground">Thursday</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-1 min-[400px]:grid-cols-3">
                    {slots.map((s, i) => (
                      <span
                        key={s}
                        className={cn(
                          'tabular rounded-md border py-1 text-center text-[10px] font-medium transition-colors duration-300 sm:text-[10.5px]',
                          i > 3 && 'hidden min-[400px]:block',
                          s === PICK && p === 1 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-foreground',
                        )}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  <div
                    className={cn(
                      'mt-2 rounded-md py-1.5 text-center text-[10px] font-semibold transition-colors duration-300 sm:text-[10.5px]',
                      p === 1 ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground',
                    )}
                  >
                    {p === 1 ? `Book ${PICK}` : 'Pick a time'}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="done"
                  className="flex h-full flex-col items-center justify-center text-center"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease }}
                >
                  <span className="grid size-9 place-items-center rounded-full bg-success-soft text-success">
                    <Check className="size-5" strokeWidth={2.75} />
                  </span>
                  <p className="mt-2 font-display text-[13px] font-bold">You’re booked</p>
                  <p className="text-[10px] text-muted-foreground">Thu · {PICK} · with Leo</p>
                  <p className="mt-1 text-[9.5px] text-subtle-foreground">Confirmation sent by email</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
