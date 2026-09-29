'use client'

import Link from 'next/link'
import * as React from 'react'
import {
  Bell,
  Check,
  ChevronsUpDown,
  ExternalLink,
  LogOut,
  Plus,
  Search,
  Settings,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Avatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/menu'
import { ThemeSwitcher } from '@/components/providers/theme'
import { LogoMark } from '@/components/brand/logo'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { signOutAction } from '@/app/(auth)/actions'
import { inboxAction, markInboxReadAction, switchBusinessAction } from '@/app/app/shell-actions'
import { useLocale, useT } from '@/components/i18n/provider'
import { LanguageSwitcher } from '@/components/i18n/language-switcher'
import { useCommandPalette } from './command-palette'
import { formatTag } from './format-locale'

type Membership = { businessId: string; name: string; role: string }
type InboxItem = {
  id: string
  title: string
  body: string | null
  href: string | null
  readAt: Date | null
  createdAt: Date
}

export function Topbar({
  user,
  business,
  memberships,
  initialUnread,
  bookingUrl,
  canCreate,
}: {
  user: { name: string; email: string }
  business: { id: string; name: string }
  memberships: Membership[]
  initialUnread: number
  bookingUrl: string | null
  canCreate: boolean
}) {
  const palette = useCommandPalette()
  const t = useT('app-shell')
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur sm:h-16 sm:px-5">
      <Link href="/app" className="me-1 lg:hidden" aria-label={t('topbar.home')}>
        <LogoMark className="size-7" />
      </Link>
      <BusinessSwitcher business={business} memberships={memberships} />
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => palette.open()}
        className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:border-border-strong md:flex"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-start">{t('topbar.searchPlaceholder')}</span>
        <Kbd>⌘K</Kbd>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => palette.open()}
        aria-label={t('topbar.search')}
      >
        <Search />
      </Button>
      {canCreate && (
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link href="/app/appointments?new=1">
            <Plus /> {t('topbar.newAppointment')}
          </Link>
        </Button>
      )}
      {bookingUrl && (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          aria-label={t('topbar.openBookingPage')}
        >
          <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
          </a>
        </Button>
      )}
      <LanguageSwitcher mode="account" compact className="hidden sm:inline-flex" />
      <InboxButton initialUnread={initialUnread} />
      <DropdownMenu>
        <DropdownMenuTrigger
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('topbar.accountMenu')}
        >
          <Avatar name={user.name} className="size-8" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuLabel className="text-foreground">
            <span className="block truncate font-semibold">{user.name}</span>
            <span className="block truncate font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/app/settings/account">
              <User /> {t('topbar.account')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/app/settings">
              <Settings /> {t('topbar.settings')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="flex items-center justify-between px-2.5 py-1.5 text-sm">
            <span className="text-muted-foreground">{t('topbar.theme')}</span>
            <ThemeSwitcher />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOutAction()}>
            <LogOut /> {t('topbar.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

function BusinessSwitcher({
  business,
  memberships,
}: {
  business: { id: string; name: string }
  memberships: Membership[]
}) {
  const t = useT('app-shell')
  if (memberships.length <= 1) {
    return <span className="truncate text-sm font-semibold sm:text-[15px]">{business.name}</span>
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-surface-2 sm:text-[15px]">
        <span className="truncate">{business.name}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t('topbar.switchBusiness')}</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.businessId}
            onSelect={() => void switchBusinessAction(m.businessId)}
          >
            <span className="flex-1 truncate">{m.name}</span>
            {m.businessId === business.id && <Check className="!text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding?new=1">
            <Plus /> {t('topbar.addBusiness')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function InboxButton({ initialUnread }: { initialUnread: number }) {
  const t = useT('app-shell')
  const { locale } = useLocale()
  const [unread, setUnread] = React.useState(initialUnread)
  const [items, setItems] = React.useState<InboxItem[] | null>(null)
  const load = async () => {
    const r = await inboxAction()
    if (r.ok) {
      setItems(r.data.items)
      setUnread(r.data.unread)
    }
  }
  return (
    <Popover onOpenChange={(o) => o && void load()}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread ? t('inbox.labelUnread', { count: unread }) : t('inbox.label')}
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute end-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] leading-4 font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{t('inbox.title')}</p>
          {unread > 0 && (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={async () => {
                await markInboxReadAction()
                setUnread(0)
                setItems((xs) => xs?.map((x) => ({ ...x, readAt: new Date() })) ?? null)
              }}
            >
              {t('inbox.markAllRead')}
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items === null && (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('inbox.loading')}</p>
          )}
          {items?.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('inbox.empty')}</p>
          )}
          <ul>
            {items?.map((i) => (
              <li key={i.id} className="border-b border-border last:border-0">
                <Link
                  href={i.href ?? '/app'}
                  onClick={() => !i.readAt && void markInboxReadAction([i.id])}
                  className={cn(
                    'flex gap-3 px-4 py-3 hover:bg-surface-2',
                    !i.readAt && 'bg-primary-soft/30',
                  )}
                >
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      i.readAt ? 'bg-transparent' : 'bg-primary',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{i.title}</span>
                    {i.body && (
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">
                        {i.body}
                      </span>
                    )}
                    <span className="mt-1 block text-xs text-subtle-foreground">
                      {formatRelative(i.createdAt, new Date(), formatTag(locale))}
                    </span>
                  </span>
                  {!i.readAt && <span className="sr-only">{t('inbox.unread')}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  )
}
