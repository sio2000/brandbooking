'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared building blocks for the landing page's product showcases, so every
 * mockup shares one frame, one label style and one motion vocabulary.
 */

const noop = () => () => {}

/** `prefers-reduced-motion: reduce` (false during SSR). */
export function useReducedMotion() {
  return React.useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
}

/** True once hydrated on the client (false during SSR/hydration). */
export function useHydrated() {
  return React.useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
}

/**
 * Fires once when the element scrolls into view. Returns [ref, inView].
 * Without IntersectionObserver the content counts as visible.
 */
export function useInViewOnce<T extends Element>(rootMargin = '0px 0px -15% 0px') {
  const ref = React.useRef<T>(null)
  const [inView, setInView] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      const t = setTimeout(() => setInView(true), 0)
      return () => clearTimeout(t)
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin])
  return [ref, inView] as const
}

/** Small uppercase section label, optionally numbered ("02 — Calendar"). */
export function Kicker({
  index,
  children,
  tone = 'default',
  className,
}: {
  index?: string
  children: React.ReactNode
  tone?: 'default' | 'ink'
  className?: string
}) {
  return (
    <p
      className={cn(
        'flex items-center gap-3 text-[12.5px] font-semibold tracking-[0.14em] uppercase',
        tone === 'ink' ? 'text-ink-primary' : 'text-primary',
        className,
      )}
    >
      {index && (
        <span
          className={cn('tabular', tone === 'ink' ? 'text-ink-muted' : 'text-subtle-foreground')}
        >
          {index}
        </span>
      )}
      {index && (
        <span
          aria-hidden
          className={cn('h-px w-6', tone === 'ink' ? 'bg-ink-border' : 'bg-border-strong')}
        />
      )}
      {children}
    </p>
  )
}

/** Heading block used at the top of each section. */
export function SectionIntro({
  id,
  index,
  kicker,
  title,
  lead,
  tone = 'default',
  align = 'left',
  className,
}: {
  id: string
  index?: string
  kicker: React.ReactNode
  title: React.ReactNode
  lead?: React.ReactNode
  tone?: 'default' | 'ink'
  align?: 'left' | 'center'
  className?: string
}) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      <Kicker index={index} tone={tone} className={cn(align === 'center' && 'justify-center')}>
        {kicker}
      </Kicker>
      <h2 id={id} className={cn('mt-4 text-h2', tone === 'ink' && 'text-ink-foreground')}>
        {title}
      </h2>
      {lead && (
        <p
          className={cn(
            'mt-5 text-lead',
            tone === 'ink' ? 'text-ink-muted' : 'text-muted-foreground',
          )}
        >
          {lead}
        </p>
      )}
    </div>
  )
}

/**
 * A product "window": the frame every UI mockup sits in. Deliberately plain —
 * a hairline border, a quiet top bar with the page/route name, a soft shadow.
 */
export function ProductFrame({
  label,
  meta,
  children,
  className,
  bodyClassName,
  tone = 'default',
}: {
  label: React.ReactNode
  meta?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  tone?: 'default' | 'ink'
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[18px] border shadow-[0_1px_2px_rgb(29_26_22/0.04),0_18px_40px_-18px_rgb(29_26_22/0.22)]',
        tone === 'ink'
          ? 'border-ink-border bg-ink-2 text-ink-foreground shadow-[0_24px_60px_-24px_rgb(0_0_0/0.6)]'
          : 'border-border bg-surface',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-10 items-center gap-3 border-b px-4 text-[12px]',
          tone === 'ink'
            ? 'border-ink-border bg-ink-3/60 text-ink-muted'
            : 'border-border bg-surface-2/60 text-muted-foreground',
        )}
      >
        <span aria-hidden className="flex gap-1">
          <span
            className={cn(
              'size-2 rounded-full',
              tone === 'ink' ? 'bg-ink-border' : 'bg-border-strong',
            )}
          />
          <span
            className={cn(
              'size-2 rounded-full',
              tone === 'ink' ? 'bg-ink-border' : 'bg-border-strong',
            )}
          />
        </span>
        <span className="truncate font-medium">{label}</span>
        {meta && <span className="ml-auto shrink-0">{meta}</span>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  )
}

/** Marks illustrative figures so they are never read as claims. */
export function SampleNote({
  children = 'Sample data',
  tone = 'default',
  className,
}: {
  children?: React.ReactNode
  tone?: 'default' | 'ink'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tone === 'ink'
          ? 'border-ink-border text-ink-muted'
          : 'border-border text-subtle-foreground',
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-60" />
      {children}
    </span>
  )
}

/** Animated number that counts from `from` to `to` once `run` is true. */
export function CountUp({
  from = 0,
  to,
  run,
  format = (n: number) => Math.round(n).toLocaleString('en-GB'),
  duration = 900,
}: {
  from?: number
  to: number
  run: boolean
  format?: (n: number) => string
  duration?: number
}) {
  const reduced = useReducedMotion()
  const [value, setValue] = React.useState(from)
  React.useEffect(() => {
    if (!run) return
    if (reduced) {
      const t = setTimeout(() => setValue(to), 0)
      return () => clearTimeout(t)
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, from, to, duration, reduced])
  return <span className="tabular">{format(run ? value : from)}</span>
}
