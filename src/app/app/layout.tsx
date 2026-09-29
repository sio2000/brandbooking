import type { Metadata } from 'next'
import { requireTenantPage, listMemberships } from '@/server/tenancy/context'
import { inbox } from '@/server/business/overview'
import { accessFor } from '@/server/billing/service'
import { appUrl, isEmailSimulated } from '@/server/env'
import { getPlanPrice } from '@/server/pricing'
import { getLocale, getT } from '@/server/i18n'
import { NAMESPACES } from '@/lib/i18n/registry'
import { LOCALE_META } from '@/lib/i18n/config'
import { Translations } from '@/components/i18n/translations'
import { NAV_GROUPS } from '@/components/dashboard/nav'
import { MobileNav, Sidebar } from '@/components/dashboard/sidebar'
import { Topbar } from '@/components/dashboard/topbar'
import { CommandPaletteProvider } from '@/components/dashboard/command-palette'
import { AccountBanner } from '@/components/dashboard/banners'
import { bookingPath } from '@/lib/booking-url'

/**
 * Catalogues every dashboard page may need on the client: all `app-*`
 * namespaces plus the shared ones. Taken from the registry, so a new
 * dashboard namespace is picked up without touching this list.
 */
const SHARED = new Set<string>(['ui', 'errors', 'validation', 'common'])
const DASHBOARD_NAMESPACES = NAMESPACES.filter(
  (ns: string) => ns.startsWith('app-') || SHARED.has(ns),
)

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-shell')
  return {
    title: { default: t('meta.title'), template: '%s · Hournook' },
    robots: { index: false, follow: false },
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenantPage()
  const locale = await getLocale()
  const [memberships, box, access, t, price] = await Promise.all([
    listMemberships(ctx.user.id),
    inbox(ctx, 1),
    accessFor(ctx.business),
    getT('app-shell', locale),
    getPlanPrice(LOCALE_META[locale].tag),
  ])
  const groups = NAV_GROUPS.map((g) => ({
    label: g.key ? t(`nav.groups.${g.key}`) : undefined,
    items: g.items
      .filter((i) => !i.any || i.any.some((p) => ctx.can(p)))
      .map((i) => ({ ...i, label: t(`nav.items.${i.key}`) })),
  })).filter((g) => g.items.length)
  const bookingUrl =
    ctx.business.publishStatus === 'draft' ? null : appUrl(bookingPath(ctx.business.slug))
  const can = {
    createAppointment: ctx.can('appointments.manage_all') || ctx.can('appointments.manage_own'),
    services: ctx.can('services.manage'),
    staff: ctx.can('staff.manage'),
    customers: ctx.can('customers.view'),
    analytics: ctx.can('analytics.view'),
    bookingPage: ctx.can('booking_page.manage'),
    settings: ctx.can('settings.manage'),
    billing: ctx.can('billing.view'),
    admin: ctx.user.isPlatformAdmin,
  }
  return (
    <Translations ns={DASHBOARD_NAMESPACES}>
      <CommandPaletteProvider bookingUrl={bookingUrl} timezone={ctx.business.timezone} can={can}>
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-2 focus:top-2"
        >
          {t('skipToContent')}
        </a>
        <div className="flex min-h-dvh">
          <Sidebar
            groups={groups}
            footer={
              <div className="px-2 py-1 text-xs text-muted-foreground">
                {t('signedInAs', { role: t(`roles.${ctx.membership.role}`) })}
              </div>
            }
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <AccountBanner
              input={{
                emailVerified: ctx.user.emailVerified,
                emailSimulated: isEmailSimulated(),
                email: ctx.user.email,
                suspended: ctx.business.status === 'suspended',
                access: {
                  state: access.state,
                  trialDaysLeft: access.trialDaysLeft,
                  canAcceptBookings: access.canAcceptBookings,
                },
                canBilling: ctx.can('billing.manage'),
                planPrice: price.display,
              }}
            />
            <Topbar
              user={{ name: ctx.user.name, email: ctx.user.email }}
              business={{ id: ctx.business.id, name: ctx.business.name }}
              memberships={memberships.map((m) => ({
                businessId: m.businessId,
                name: m.name,
                role: m.role,
              }))}
              initialUnread={box.unread}
              bookingUrl={bookingUrl}
              canCreate={can.createAppointment}
              isPlatformAdmin={ctx.user.isPlatformAdmin}
            />
            <main id="main" className="flex-1 pb-20 lg:pb-0">
              {children}
            </main>
          </div>
        </div>
        <MobileNav groups={groups} />
      </CommandPaletteProvider>
    </Translations>
  )
}
