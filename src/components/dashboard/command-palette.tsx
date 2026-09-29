'use client'

import { Command } from 'cmdk'
import { Dialog as D } from 'radix-ui'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import {
  BarChart3,
  Calendar,
  CalendarPlus,
  Copy,
  CreditCard,
  Globe,
  Home,
  Link2,
  List,
  Plus,
  Scissors,
  Search,
  Settings,
  ShieldCheck,
  User,
  UserCog,
  Users,
} from 'lucide-react'
import { toast } from '@/components/ui/toaster'
import { searchAction } from '@/app/app/shell-actions'
import { formatDateTime } from '@/lib/format'
import { useLocale, useT } from '@/components/i18n/provider'
import { formatTag } from './format-locale'

type Ctx = { open: () => void }
const PaletteContext = React.createContext<Ctx>({ open: () => {} })
export const useCommandPalette = () => React.useContext(PaletteContext)

type Results =
  Awaited<ReturnType<typeof searchAction>> extends { ok: true; data: infer D } | unknown ? D : never

export function CommandPaletteProvider({
  children,
  bookingUrl,
  timezone,
  can,
}: {
  children: React.ReactNode
  bookingUrl: string | null
  timezone: string
  can: Record<string, boolean>
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<Results | null>(null)
  const router = useRouter()
  const t = useT('app-shell')
  const nav = (k: string) => t(`nav.items.${k}`)
  const tag = formatTag(useLocale().locale)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  React.useEffect(() => {
    if (query.trim().length < 2) return
    const t = setTimeout(async () => {
      const r = await searchAction(query)
      if (r.ok) setResults(r.data as Results)
    }, 180)
    return () => clearTimeout(t)
  }, [query])

  const run = (fn: () => void) => {
    setOpen(false)
    setQuery('')
    fn()
  }
  const go = (href: string) => run(() => router.push(href))

  const item =
    'flex cursor-default items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none select-none data-[selected=true]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted-foreground'
  const heading =
    '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle-foreground [&_[cmdk-group-heading]]:uppercase'
  const r = (query.trim().length >= 2 ? results : null) as {
    customers: Array<{ id: string; firstName: string; lastName: string; email: string | null }>
    services: Array<{ id: string; name: string }>
    staff: Array<{ id: string; name: string }>
    appointments: Array<{ id: string; reference: string; startsAt: Date }>
  } | null

  const pages = (
    [
      ['/app', nav('overview'), Home, true],
      ['/app/calendar', nav('calendar'), Calendar, true],
      ['/app/appointments', nav('appointments'), List, true],
      ['/app/customers', nav('customers'), Users, can.customers],
      ['/app/services', nav('services'), Scissors, can.services],
      ['/app/staff', nav('team'), UserCog, can.staff],
      ['/app/analytics', nav('analytics'), BarChart3, can.analytics],
      ['/app/booking-page', nav('bookingPage'), Globe, can.bookingPage],
      ['/app/settings', nav('settings'), Settings, can.settings],
      ['/app/billing', nav('billing'), CreditCard, can.billing],
      ['/admin', 'Admin', ShieldCheck, can.admin], // i18n-ignore: the admin area is English only
    ] as Array<[string, string, typeof Home, boolean | undefined]>
  ).filter(([, , , show]) => show)
  // While search results are shown (cmdk filtering is off), keep pages whose
  // name matches the query, so typing a page name still jumps there.
  const matchingPages = r
    ? pages.filter(([, label]) =>
        label.toLocaleLowerCase(tag).includes(query.trim().toLocaleLowerCase(tag)),
      )
    : []
  const pageItem = ([href, label, I]: (typeof pages)[number]) => (
    <Command.Item key={href} onSelect={() => go(href)} className={item}>
      <I /> {label}
    </Command.Item>
  )

  return (
    <PaletteContext.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <D.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-elevated shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]">
            <D.Title className="sr-only">{t('palette.title')}</D.Title>
            <D.Description className="sr-only">{t('palette.description')}</D.Description>
            <Command label={t('palette.title')} shouldFilter={!r} className={heading}>
              <div className="flex items-center gap-2 border-b border-border px-4">
                <Search className="size-4 text-muted-foreground" aria-hidden />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder={t('palette.placeholder')}
                  className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle-foreground"
                />
              </div>
              <Command.List
                label={t('palette.suggestions')}
                className="max-h-[60vh] overflow-y-auto p-2"
              >
                <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {t('palette.empty', { query })}
                </Command.Empty>
                {r && (
                  <>
                    {matchingPages.length > 0 && (
                      <Command.Group heading={t('palette.groups.goTo')}>
                        {matchingPages.map(pageItem)}
                      </Command.Group>
                    )}
                    {r.customers.length > 0 && (
                      <Command.Group heading={t('palette.groups.customers')}>
                        {r.customers.map((c) => (
                          <Command.Item
                            key={c.id}
                            value={`customer-${c.id}`}
                            onSelect={() => go(`/app/customers/${c.id}`)}
                            className={item}
                          >
                            <User />{' '}
                            <span className="flex-1 truncate">
                              {c.firstName} {c.lastName}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {c.email}
                            </span>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                    {r.appointments.length > 0 && (
                      <Command.Group heading={t('palette.groups.appointments')}>
                        {r.appointments.map((a) => (
                          <Command.Item
                            key={a.id}
                            value={`appt-${a.id}`}
                            onSelect={() => go(`/app/appointments/${a.id}`)}
                            className={item}
                          >
                            <Calendar /> {a.reference} · {formatDateTime(a.startsAt, timezone, tag)}
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                    {r.services.length > 0 && (
                      <Command.Group heading={t('palette.groups.services')}>
                        {r.services.map((s) => (
                          <Command.Item
                            key={s.id}
                            value={`service-${s.id}`}
                            onSelect={() => go(`/app/services?edit=${s.id}`)}
                            className={item}
                          >
                            <Scissors /> {s.name}
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                    {r.staff.length > 0 && (
                      <Command.Group heading={t('palette.groups.team')}>
                        {r.staff.map((s) => (
                          <Command.Item
                            key={s.id}
                            value={`staff-${s.id}`}
                            onSelect={() => go(`/app/staff?edit=${s.id}`)}
                            className={item}
                          >
                            <UserCog /> {s.name}
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                  </>
                )}
                {!r && (
                  <>
                    <Command.Group heading={t('palette.groups.actions')}>
                      {can.createAppointment && (
                        <Command.Item
                          onSelect={() => go('/app/appointments?new=1')}
                          className={item}
                        >
                          <CalendarPlus /> {t('palette.actions.newAppointment')}
                        </Command.Item>
                      )}
                      {can.services && (
                        <Command.Item onSelect={() => go('/app/services?new=1')} className={item}>
                          <Plus /> {t('palette.actions.addService')}
                        </Command.Item>
                      )}
                      {can.staff && (
                        <Command.Item onSelect={() => go('/app/staff?new=1')} className={item}>
                          <Plus /> {t('palette.actions.addStaff')}
                        </Command.Item>
                      )}
                      {bookingUrl && (
                        <Command.Item
                          onSelect={() =>
                            run(() => {
                              void navigator.clipboard
                                .writeText(bookingUrl)
                                .then(() => toast.success(t('palette.actions.linkCopied')))
                            })
                          }
                          className={item}
                        >
                          <Copy /> {t('palette.actions.copyLink')}
                        </Command.Item>
                      )}
                      {bookingUrl && (
                        <Command.Item
                          onSelect={() => run(() => window.open(bookingUrl, '_blank', 'noopener'))}
                          className={item}
                        >
                          <Link2 /> {t('palette.actions.preview')}
                        </Command.Item>
                      )}
                    </Command.Group>
                    <Command.Group heading={t('palette.groups.goTo')}>
                      {pages.map(pageItem)}
                    </Command.Group>
                  </>
                )}
              </Command.List>
            </Command>
          </D.Content>
        </D.Portal>
      </D.Root>
    </PaletteContext.Provider>
  )
}
