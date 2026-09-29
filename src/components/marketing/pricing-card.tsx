import { ArrowRight, Check } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { localizedPath } from '@/lib/i18n/config'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'
import { getFormatLocale, getLocale, getT } from '@/server/i18n'
import { getPlanPrice } from '@/server/pricing'

/** What the plan includes (keys of `marketing-pricing:card.inclusions`). */
export const planInclusions = [
  'unlimited',
  'page',
  'profile',
  'services',
  'availability',
  'calendar',
  'customers',
  'emails',
  'analytics',
  'team',
  'secure',
  'responsive',
  'qr',
] as const

/** The single plan. `compact` shows a short list and links to the full pricing page. */
export async function PricingCard({
  compact = false,
  className,
  headingLevel = 3,
}: {
  compact?: boolean
  className?: string
  headingLevel?: 2 | 3
}) {
  const [t, locale, price] = await Promise.all([
    getT('marketing-pricing'),
    getLocale(),
    getFormatLocale().then(getPlanPrice),
  ])
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  const items = compact
    ? planInclusions.filter((_, i) => [0, 1, 5, 6, 7, 9, 12].includes(i))
    : planInclusions
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.75rem] border border-border bg-surface p-6 shadow-lg sm:p-8',
        className,
      )}
    >
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Heading className="font-sans text-base font-semibold tracking-normal">
            {site.name}
          </Heading>
          <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-soft-foreground">
            {t('card.badge')}
          </span>
        </div>
        <p className="mt-5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
          <span className="tabular font-display text-[3.5rem] leading-none font-bold tracking-tight sm:text-6xl">
            {price.display}
          </span>
          <span className="text-base text-muted-foreground">{t('card.perMonth')}</span>
        </p>
        <p className="mt-3 text-[15px] text-muted-foreground">
          {t('card.trial', { days: site.trialDays })}
        </p>
        <Button asChild size="lg" className="mt-6 h-auto min-h-12 w-full py-2.5 whitespace-normal">
          <Link href="/signup">
            {t('card.cta')} <ArrowRight aria-hidden className="shrink-0 rtl:-scale-x-100" />
          </Link>
        </Button>
        <ul
          className={cn(
            'mt-7 grid gap-x-6 gap-y-2.5 border-t border-border pt-6 text-[15px]',
            !compact && 'sm:grid-cols-2',
          )}
        >
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
              {t(`card.inclusions.${item}`)}
            </li>
          ))}
        </ul>
        {compact && (
          <Link
            href={localizedPath('/pricing', locale)}
            className="mt-6 inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-semibold text-primary hover:underline"
          >
            {t('card.seeAll')} <ArrowRight aria-hidden className="size-4 shrink-0 rtl:-scale-x-100" />
          </Link>
        )}
      </div>
    </div>
  )
}
