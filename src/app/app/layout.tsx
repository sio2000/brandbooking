import type { Metadata } from 'next'
import { requireTenantPage, listMemberships } from '@/server/tenancy/context'
import { inbox } from '@/server/business/overview'
import { accessFor } from '@/server/billing/service'
import { appUrl, isEmailSimulated } from '@/server/env'
import { NAV_GROUPS } from '@/components/dashboard/nav'
import { MobileNav, Sidebar } from '@/components/dashboard/sidebar'
import { Topbar } from '@/components/dashboard/topbar'
import { CommandPaletteProvider } from '@/components/dashboard/command-palette'
import { AccountBanner } from '@/components/dashboard/banners'
import { ROLE_LABELS } from '@/server/tenancy/permissions'

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s · Hournook' },
  robots: { index: false, follow: false },
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenantPage()
  const [memberships, box, access] = await Promise.all([
    listMemberships(ctx.user.id),
    inbox(ctx, 1),
    accessFor(ctx.business),
  ])
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.any || i.any.some((p) => ctx.can(p))),
  })).filter((g) => g.items.length)
  const bookingUrl =
    ctx.business.publishStatus === 'draft' ? null : appUrl(`/book/${ctx.business.slug}`)
  const can = {
    createAppointment: ctx.can('appointments.manage_all') || ctx.can('appointments.manage_own'),
    services: ctx.can('services.manage'),
    staff: ctx.can('staff.manage'),
    customers: ctx.can('customers.view'),
    analytics: ctx.can('analytics.view'),
    bookingPage: ctx.can('booking_page.manage'),
    settings: ctx.can('settings.manage'),
    billing: ctx.can('billing.view'),
  }
  return (
    <CommandPaletteProvider bookingUrl={bookingUrl} timezone={ctx.business.timezone} can={can}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <Sidebar
          groups={groups}
          footer={
            <div className="px-2 py-1 text-xs text-muted-foreground">
              Signed in as {ROLE_LABELS[ctx.membership.role].toLowerCase()}
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
          />
          <main id="main" className="flex-1 pb-20 lg:pb-0">
            {children}
          </main>
        </div>
      </div>
      <MobileNav groups={groups} />
    </CommandPaletteProvider>
  )
}
