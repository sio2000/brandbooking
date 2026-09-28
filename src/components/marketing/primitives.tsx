'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared building blocks for the marketing pages: motion preferences and the
 * section heading style.
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
