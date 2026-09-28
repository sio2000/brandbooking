import { cn } from '@/lib/utils'

/**
 * Hournook mark: an arched "nook" (a reserved little space) holding clock
 * hands that also read as a check mark — time, reserved and confirmed.
 * Pure SVG: crisp at 16px, works in one colour, on light and dark.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d="M5 26.5V14.5C5 8.425 9.925 3.5 16 3.5s11 4.925 11 11v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" fill="var(--logo-fill, var(--primary))" />
      <path d="M16 10.5v6.2l4.6 3.6" fill="none" stroke="var(--logo-ink, var(--primary-foreground))" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16.7" r="1.35" fill="var(--logo-ink, var(--primary-foreground))" />
    </svg>
  )
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={cn('size-7', markClassName)} />
      <span className="font-display text-[1.2rem] leading-none font-bold tracking-[-0.035em]">hournook</span>
      <span className="sr-only">Hournook</span>
    </span>
  )
}
