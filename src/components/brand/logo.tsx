import { cn } from '@/lib/utils'

/**
 * Hournook mark: a lowercase "h" on a rounded tile. Its arch forms the "nook",
 * a small sheltered space, and the dot inside it is the booked slot: an hour,
 * reserved. Pure SVG: crisp at 16px, adapts to light and dark themes.
 */
export const MARK_PATHS = {
  stem: 'M10.5 7.5v17',
  arch: 'M10.5 17a5.5 5.5 0 0 1 11 0v7.5',
  dot: { cx: 16, cy: 21.4, r: 2.35 },
} as const

export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-8', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--logo-fill, var(--primary))" />
      <g
        fill="none"
        stroke="var(--logo-ink, var(--primary-foreground))"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={MARK_PATHS.stem} />
        <path d={MARK_PATHS.arch} />
      </g>
      <circle {...MARK_PATHS.dot} fill="var(--logo-dot, var(--accent))" />
    </svg>
  )
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={cn('size-7', markClassName)} />
      <span
        aria-hidden
        className="font-display text-[1.25rem] leading-none font-bold tracking-[-0.04em]"
      >
        hour<span className="text-primary">nook</span>
      </span>
      <span className="sr-only">Hournook</span>
    </span>
  )
}
