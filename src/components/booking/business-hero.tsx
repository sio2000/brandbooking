import { Globe, Mail, MapPin, Phone } from 'lucide-react'
import type { PublicPageData } from '@/server/booking/public'
import { cn } from '@/lib/utils'

const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  x: 'X',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
}

export function BusinessHero({ data, compact }: { data: PublicPageData; compact?: boolean }) {
  const b = data.business
  return (
    <header className={cn('relative', compact ? 'mb-4' : 'mb-8')}>
      {!compact && (
        <div
          className="relative h-36 overflow-hidden rounded-b-3xl sm:h-52 sm:rounded-3xl"
          aria-hidden
        >
          {b.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- pre-optimized WebP from our storage
            <img src={b.coverUrl} alt="" className="size-full object-cover" fetchPriority="high" />
          ) : (
            <div
              className="size-full"
              style={{
                background:
                  'radial-gradient(120% 140% at 10% 0%, color-mix(in oklab, var(--primary) 55%, transparent) 0%, transparent 55%), radial-gradient(100% 120% at 100% 100%, color-mix(in oklab, var(--accent) 40%, transparent) 0%, transparent 60%), var(--primary-soft)',
              }}
            />
          )}
        </div>
      )}
      <div
        className={cn(
          'relative z-10 px-4',
          compact ? 'flex items-center gap-3 sm:px-0' : '-mt-10 sm:-mt-12 sm:px-6',
        )}
      >
        {b.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={b.logoUrl}
            alt={`${b.name} logo`}
            className={cn(
              'shrink-0 rounded-2xl border-4 border-background bg-surface object-contain shadow-md',
              compact ? 'size-12' : 'size-20 sm:size-24',
            )}
          />
        ) : (
          <div
            className={cn(
              'grid shrink-0 place-items-center rounded-2xl border-4 border-background bg-primary font-display font-bold text-primary-foreground shadow-md',
              compact ? 'size-12 text-lg' : 'size-20 text-3xl sm:size-24',
            )}
            aria-hidden
          >
            {b.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className={cn('min-w-0', !compact && 'mt-3')}>
          <h1
            className={cn(
              'font-bold text-balance',
              compact ? 'text-xl' : 'text-2xl sm:text-[2rem]',
            )}
          >
            {b.name}
          </h1>
          {b.category && <p className="mt-0.5 text-sm text-muted-foreground">{b.category}</p>}
        </div>
      </div>
      {!compact && b.description && (
        <p className="mt-3 max-w-2xl px-4 text-[15px] leading-relaxed whitespace-pre-line text-muted-foreground sm:px-6">
          {b.description}
        </p>
      )}
    </header>
  )
}

export function BusinessContact({ data }: { data: PublicPageData }) {
  const b = data.business
  const socials = Object.entries(b.socialLinks ?? {}).filter(([, v]) => v)
  const items = [
    b.address.length
      ? {
          Icon: MapPin,
          label: b.address.join(', '),
          href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address.join(', '))}`,
        }
      : null,
    b.phone ? { Icon: Phone, label: b.phone, href: `tel:${b.phone.replace(/[^+\d]/g, '')}` } : null,
    b.email ? { Icon: Mail, label: b.email, href: `mailto:${b.email}` } : null,
    b.website
      ? {
          Icon: Globe,
          label: b.website.replace(/^https?:\/\//, '').replace(/\/$/, ''),
          href: b.website,
        }
      : null,
  ].filter(Boolean) as Array<{ Icon: typeof MapPin; label: string; href: string }>
  if (!items.length && !socials.length && !b.bookingPolicy) return null
  return (
    <aside
      className="grid gap-5 rounded-2xl border border-border bg-surface p-5 shadow-xs"
      aria-label="Contact information"
    >
      {items.length > 0 && (
        <ul className="grid gap-3 text-sm">
          {items.map(({ Icon, label, href }) => (
            <li key={label}>
              <a
                href={href}
                className="flex items-start gap-3 rounded-md hover:text-primary"
                target={href.startsWith('http') ? '_blank' : undefined}
                rel="noopener noreferrer"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 break-words">{label}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {socials.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {socials.map(([k, v]) => (
            <a
              key={k}
              href={v}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:border-primary hover:text-primary"
            >
              {SOCIAL_LABELS[k] ?? k}
            </a>
          ))}
        </div>
      )}
      {b.bookingPolicy && (
        <div>
          <h2 className="font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Booking policy
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">
            {b.bookingPolicy}
          </p>
        </div>
      )}
    </aside>
  )
}
