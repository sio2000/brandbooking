import { ArrowRight, Check } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'

export const planInclusions = [
  'Unlimited bookings',
  'Your own booking page',
  'Business profile',
  'Services',
  'Availability & holidays',
  'Appointment management & calendar',
  'Customer management',
  'Email confirmations & reminders',
  'Analytics',
  'Team members',
  'Secure account',
  'Responsive booking page',
  'QR code & embeddable widget',
] as const

/** The single plan. `compact` shows a short list and links to the full pricing page. */
export function PricingCard({ compact = false, className, headingLevel = 3 }: { compact?: boolean; className?: string; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  const items = compact ? planInclusions.filter((_, i) => [0, 1, 5, 6, 7, 9, 12].includes(i)) : planInclusions
  return (
    <div className={cn('relative overflow-hidden rounded-[1.75rem] border border-border bg-surface p-6 shadow-lg sm:p-8', className)}>
      <div aria-hidden className="absolute -top-24 -right-20 size-64 rounded-full bg-primary/12 blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Heading className="font-sans text-base font-semibold tracking-normal">{site.name}</Heading>
          <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-soft-foreground">One plan · everything included</span>
        </div>
        <p className="mt-5 flex items-baseline gap-1.5">
          <span className="tabular font-display text-[3.5rem] leading-none font-bold tracking-tight sm:text-6xl">{site.price.display}</span>
          <span className="text-base text-muted-foreground">/ {site.price.period}</span>
        </p>
        <p className="mt-3 text-[15px] text-muted-foreground">
          {site.trialDays}-day free trial. No card required to start. No per-booking fees.
        </p>
        <Button asChild size="lg" className="mt-6 w-full">
          <Link href="/signup">
            Start your free trial <ArrowRight aria-hidden />
          </Link>
        </Button>
        <ul className={cn('mt-7 grid gap-x-6 gap-y-2.5 border-t border-border pt-6 text-[15px]', !compact && 'sm:grid-cols-2')}>
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                <Check className="size-3" strokeWidth={3} />
              </span>
              {item}
            </li>
          ))}
        </ul>
        {compact && (
          <Link href="/pricing" className="mt-6 inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-semibold text-primary hover:underline">
            See everything that’s included <ArrowRight aria-hidden className="size-4" />
          </Link>
        )}
      </div>
    </div>
  )
}
