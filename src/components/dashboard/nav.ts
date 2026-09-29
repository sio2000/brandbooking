import type { Permission } from '@/server/tenancy/permissions'

/** Translation keys under `app-shell:nav.items` / `app-shell:nav.groups`. */
export type NavItemKey =
  | 'overview'
  | 'calendar'
  | 'appointments'
  | 'customers'
  | 'services'
  | 'team'
  | 'availability'
  | 'analytics'
  | 'bookingPage'
  | 'settings'
  | 'billing'
export type NavGroupKey = 'business' | 'grow' | 'account'

export type NavItem = {
  href: string
  /** Translated label (filled in by the layout from `key`). */
  label: string
  key: NavItemKey
  icon: string
  any?: Permission[]
  mobile?: boolean
}

type NavItemDef = Omit<NavItem, 'label'>

/** Navigation, filtered by permission so each role sees only what it can use. */
export const NAV_GROUPS: Array<{ key?: NavGroupKey; items: NavItemDef[] }> = [
  {
    items: [
      { href: '/app', key: 'overview', icon: 'home', mobile: true },
      { href: '/app/calendar', key: 'calendar', icon: 'calendar', mobile: true },
      { href: '/app/appointments', key: 'appointments', icon: 'list', mobile: true },
      {
        href: '/app/customers',
        key: 'customers',
        icon: 'users',
        any: ['customers.view'],
        mobile: true,
      },
    ],
  },
  {
    key: 'business',
    items: [
      { href: '/app/services', key: 'services', icon: 'scissors', any: ['services.manage'] },
      { href: '/app/staff', key: 'team', icon: 'team', any: ['staff.manage'] },
      {
        href: '/app/availability',
        key: 'availability',
        icon: 'clock',
        any: ['availability.manage', 'availability.manage_own'],
      },
      { href: '/app/analytics', key: 'analytics', icon: 'chart', any: ['analytics.view'] },
    ],
  },
  {
    key: 'grow',
    items: [
      {
        href: '/app/booking-page',
        key: 'bookingPage',
        icon: 'globe',
        any: ['booking_page.manage'],
      },
    ],
  },
  {
    key: 'account',
    items: [
      {
        href: '/app/settings',
        key: 'settings',
        icon: 'settings',
        any: ['settings.manage', 'team.manage'],
      },
      { href: '/app/billing', key: 'billing', icon: 'card', any: ['billing.view'] },
    ],
  },
]
