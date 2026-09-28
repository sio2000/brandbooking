'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { Activity, Bell, Building2, CalendarCog, ShieldCheck, UserRound, Users } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

const ICONS = { business: Building2, booking: CalendarCog, notifications: Bell, team: Users, account: UserRound, privacy: ShieldCheck, activity: Activity }

export type SettingsNavItem = { href: string; label: string; icon: keyof typeof ICONS }

function isActive(pathname: string, href: string) {
  return href === '/app/settings' ? pathname === href : pathname === href || pathname.startsWith(href + '/')
}

/** Underlined tabs on desktop; a horizontally scrolling row of pills on phones. */
export function SettingsNav({ items }: { items: SettingsNavItem[] }) {
  const pathname = usePathname()
  const listRef = React.useRef<HTMLUListElement>(null)
  const activeRef = React.useRef<HTMLLIElement>(null)

  React.useEffect(() => {
    // Keep the current tab visible in the scrolling pill row on small screens
    // (horizontal only — never moves the page vertically).
    const ul = listRef.current
    const li = activeRef.current
    if (!ul || !li || ul.scrollWidth <= ul.clientWidth) return
    ul.scrollTo({ left: li.offsetLeft - ul.clientWidth / 2 + li.offsetWidth / 2 })
  }, [pathname])

  return (
    <nav aria-label="Settings" className="-mx-4 mb-6 sm:mx-0 md:mb-8 md:border-b md:border-border">
      <ul ref={listRef} className="relative flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:px-0 md:gap-1 md:overflow-visible md:pb-0">
        {items.map((item) => {
          const Icon = ICONS[item.icon]
          const active = isActive(pathname, item.href)
          return (
            <li key={item.href} ref={active ? activeRef : undefined} className="relative shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'md:h-11 md:rounded-none md:rounded-t-md md:border-0 md:px-3',
                  active
                    ? 'border-primary bg-primary text-primary-foreground md:bg-transparent md:text-foreground'
                    : 'border-border bg-surface text-muted-foreground hover:text-foreground md:bg-transparent md:hover:bg-surface-2/60',
                )}
              >
                <Icon className={cn('size-4', active && 'md:text-primary')} aria-hidden />
                {item.label}
              </Link>
              {active && (
                <motion.span
                  layoutId="settings-tab"
                  className="absolute inset-x-2 -bottom-px hidden h-0.5 rounded-full bg-primary md:block"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  aria-hidden
                />
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
