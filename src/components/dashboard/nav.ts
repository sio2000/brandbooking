import type { Permission } from '@/server/tenancy/permissions'

export type NavItem = { href: string; label: string; icon: string; any?: Permission[]; mobile?: boolean }

/** Navigation, filtered by permission so each role sees only what it can use. */
export const NAV_GROUPS: Array<{ label?: string; items: NavItem[] }> = [
  {
    items: [
      { href: '/app', label: 'Overview', icon: 'home', mobile: true },
      { href: '/app/calendar', label: 'Calendar', icon: 'calendar', mobile: true },
      { href: '/app/appointments', label: 'Appointments', icon: 'list', mobile: true },
      { href: '/app/customers', label: 'Customers', icon: 'users', any: ['customers.view'], mobile: true },
    ],
  },
  {
    label: 'Business',
    items: [
      { href: '/app/services', label: 'Services', icon: 'scissors', any: ['services.manage'] },
      { href: '/app/staff', label: 'Team', icon: 'team', any: ['staff.manage'] },
      { href: '/app/availability', label: 'Availability', icon: 'clock', any: ['availability.manage', 'availability.manage_own'] },
      { href: '/app/analytics', label: 'Analytics', icon: 'chart', any: ['analytics.view'] },
    ],
  },
  {
    label: 'Grow',
    items: [{ href: '/app/booking-page', label: 'Booking page', icon: 'globe', any: ['booking_page.manage'] }],
  },
  {
    label: 'Account',
    items: [
      { href: '/app/settings', label: 'Settings', icon: 'settings', any: ['settings.manage', 'team.manage'] },
      { href: '/app/billing', label: 'Billing', icon: 'card', any: ['billing.view'] },
    ],
  },
]
