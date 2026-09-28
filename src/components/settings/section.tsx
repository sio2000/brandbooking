import * as React from 'react'
import { cn } from '@/lib/utils'

/** Page-level intro for a settings tab. */
export function SettingsIntro({
  title,
  description,
  action,
}: {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="font-sans text-lg font-semibold tracking-normal">{title}</h2>
        {description && (
          <p className="mt-0.5 max-w-2xl text-sm text-pretty text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/**
 * Two-column settings group: explanation on the left, controls on the right
 * (stacked on phones). Keeps long forms scannable.
 */
export function SettingsGroup({
  title,
  description,
  children,
  className,
  id,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn(
        'grid gap-4 py-6 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8',
        className,
      )}
    >
      <div className="min-w-0">
        <h3
          id={id ? `${id}-title` : undefined}
          className="font-sans text-[15px] font-semibold tracking-normal"
        >
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-[13px] leading-relaxed text-pretty text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

/** Sticky save bar at the bottom of a settings form. */
export function SaveBar({ dirty, children }: { dirty: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('z-10 mt-6', dirty && 'sticky bottom-20 lg:bottom-4')}>
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-elevated/95 px-4 py-3 shadow-md backdrop-blur transition-colors',
          dirty ? 'border-primary/40' : 'border-border',
        )}
      >
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {dirty ? (
            <span className="inline-flex items-center gap-2 font-medium text-foreground">
              <span className="size-2 rounded-full bg-accent" aria-hidden /> Unsaved changes
            </span>
          ) : (
            'All changes saved'
          )}
        </p>
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </div>
  )
}
