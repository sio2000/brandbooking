'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Building2,
  Euro,
  Flag,
  KeyRound,
  LayoutDashboard,
  Menu,
  ScrollText,
  Users,
} from 'lucide-react'
import { Dialog, DialogClose, DialogTrigger, SheetContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/brand/logo'
import { ThemeSwitcher } from '@/components/providers/theme'
import { cn } from '@/lib/utils'

const items = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/stats', label: 'Stats', icon: BarChart3 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/businesses', label: 'Businesses', icon: Building2 },
  { href: '/admin/pricing', label: 'Pricing', icon: Euro },
  { href: '/admin/flags', label: 'Feature flags', icon: Flag },
  { href: '/admin/health', label: 'Health', icon: Activity },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
] as const

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminBrand() {
  return (
    <Link href="/admin" className="inline-flex items-center gap-2 rounded-md">
      <Logo markClassName="size-6" className="[&>span:nth-child(2)]:text-[1.05rem]" />
      <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-background uppercase">
        Admin
      </span>
    </Link>
  )
}

function NavLinks({ onNavigate }: { onNavigate?: boolean }) {
  const pathname = usePathname()
  return (
    <ul className="grid grid-cols-1 gap-0.5">
      {items.map((it) => {
        const active = isActive(pathname, it.href, 'exact' in it ? it.exact : false)
        const link = (
          <Link
            href={it.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-surface-2 text-foreground'
                : 'text-muted-foreground hover:bg-surface-2/70 hover:text-foreground',
            )}
          >
            <it.icon className={cn('size-4 shrink-0', active && 'text-primary')} aria-hidden />
            {it.label}
          </Link>
        )
        return (
          <li key={it.href}>{onNavigate ? <DialogClose asChild>{link}</DialogClose> : link}</li>
        )
      })}
    </ul>
  )
}

function Footer({
  email,
  inSheet,
  hasBusiness,
}: {
  email: string
  inSheet?: boolean
  hasBusiness: boolean
}) {
  // An admin without a business of their own goes back to the site, not to onboarding.
  const back = (
    <Link
      href={hasBusiness ? '/app' : '/'}
      className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2/70 hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {hasBusiness ? 'Back to app' : 'Back to site'}
    </Link>
  )
  const account = (
    <Link
      href="/admin/account"
      className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2/70 hover:text-foreground"
    >
      <KeyRound className="size-4" aria-hidden />
      Your account
    </Link>
  )
  return (
    <div className="grid grid-cols-1 gap-2 border-t border-border pt-3">
      {inSheet ? <DialogClose asChild>{account}</DialogClose> : account}
      {inSheet ? <DialogClose asChild>{back}</DialogClose> : back}
      <div className="grid grid-cols-1 gap-2 px-2.5">
        <p className="min-w-0 truncate text-xs text-muted-foreground" title={email}>
          Signed in as <span className="font-medium text-foreground">{email}</span>
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground" aria-hidden>
            Theme
          </span>
          <ThemeSwitcher />
        </div>
      </div>
    </div>
  )
}

/** Fixed sidebar on large screens. */
export function AdminSidebar({ email, hasBusiness }: { email: string; hasBusiness: boolean }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface px-3 py-4 lg:flex">
      <div className="px-2.5 pb-5">
        <AdminBrand />
      </div>
      <nav aria-label="Admin" className="flex-1 overflow-y-auto">
        <NavLinks />
      </nav>
      <Footer email={email} hasBusiness={hasBusiness} />
    </aside>
  )
}

/** Sticky top bar with a slide-over menu on small screens. */
export function AdminTopBar({ email, hasBusiness }: { email: string; hasBusiness: boolean }) {
  const pathname = usePathname()
  const current = items.find((it) => isActive(pathname, it.href, 'exact' in it ? it.exact : false))
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur lg:hidden">
      <AdminBrand />
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Open admin menu${current ? ` (current: ${current.label})` : ''}`}
          >
            <Menu aria-hidden />
            <span className="hidden min-[380px]:inline">Menu</span>
          </Button>
        </DialogTrigger>
        <SheetContent title="Admin menu" className="sm:max-w-xs">
          <div className="flex h-full flex-col gap-4 px-3 py-4">
            <nav aria-label="Admin" className="flex-1">
              <NavLinks onNavigate />
            </nav>
            <Footer email={email} hasBusiness={hasBusiness} inSheet />
          </div>
        </SheetContent>
      </Dialog>
    </header>
  )
}
