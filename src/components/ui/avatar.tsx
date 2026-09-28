import { cn, initials } from '@/lib/utils'

/** Photo avatar with an initials fallback tinted by the member's colour. */
export function Avatar({ name, src, color, className }: { name: string; src?: string | null; color?: string | null; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- user uploads served from storage; sizes are pre-generated
    return <img src={src} alt="" className={cn('size-8 shrink-0 rounded-full object-cover ring-2 ring-surface', className)} />
  }
  return (
    <span
      aria-hidden
      className={cn('grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold ring-2 ring-surface', className)}
      style={{ backgroundColor: `color-mix(in oklab, ${color ?? 'var(--primary)'} 18%, var(--surface))`, color: `color-mix(in oklab, ${color ?? 'var(--primary)'} 80%, var(--foreground))` }}
    >
      {initials(name)}
    </span>
  )
}
