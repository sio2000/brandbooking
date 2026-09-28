'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { MoreHorizontal } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/brand/logo'
import { Dialog, SheetContent, DialogTrigger } from '@/components/ui/dialog'
import { NAV_ICONS } from './icons'
import type { NavItem } from './nav'

export type NavGroup = { label?: string; items: NavItem[] }

function isActive(pathname: string, href: string) {
  return href === '/app'
    ? pathname === '/app'
    : pathname === href || pathname.startsWith(href + '/')
}

export function Sidebar({ groups, footer }: { groups: NavGroup[]; footer?: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface/60 lg:flex">
      <div className="flex h-16 items-center px-5">
        <Link href="/app" className="rounded-md">
          <Logo />
        </Link>
      </div>
      <nav aria-label="Main" className="flex-1 scrollbar-thin overflow-y-auto px-3 pb-4">
        {groups.map((g, gi) => (
          <div key={gi} className={cn(gi > 0 && 'mt-5')}>
            {g.label && (
              <p className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-subtle-foreground uppercase">
                {g.label}
              </p>
            )}
            <ul className="grid gap-0.5">
              {g.items.map((item) => {
                const Icon = NAV_ICONS[item.icon as keyof typeof NAV_ICONS]
                const active = isActive(pathname, item.href)
                return (
                  <li key={item.href} className="relative">
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-border"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                        active
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                      )}
                    >
                      <Icon className={cn('size-[18px]', active && 'text-primary')} aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      {footer && <div className="border-t border-border p-3">{footer}</div>}
    </aside>
  )
}

/** Bottom tab bar on phones: the four daily destinations + "More". */
export function MobileNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  const all = groups.flatMap((g) => g.items)
  const primary = all.filter((i) => i.mobile).slice(0, 4)
  const rest = all.filter((i) => !primary.includes(i))
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {primary.map((item) => {
          const Icon = NAV_ICONS[item.icon as keyof typeof NAV_ICONS]
          const active = isActive(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          )
        })}
        <li>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              className={cn(
                'flex h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium',
                rest.some((i) => isActive(pathname, i.href))
                  ? 'text-primary'
                  : 'text-muted-foreground',
              )}
            >
              <MoreHorizontal className="size-5" aria-hidden />
              More
            </DialogTrigger>
            <SheetContent title="More">
              <ul className="grid gap-1 p-3">
                {rest.map((item) => {
                  const Icon = NAV_ICONS[item.icon as keyof typeof NAV_ICONS]
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'flex h-12 items-center gap-3 rounded-xl px-3 font-medium',
                          isActive(pathname, item.href)
                            ? 'bg-primary-soft text-primary-soft-foreground'
                            : 'hover:bg-surface-2',
                        )}
                      >
                        <Icon className="size-5 text-muted-foreground" aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </SheetContent>
          </Dialog>
        </li>
      </ul>
    </nav>
  )
}
