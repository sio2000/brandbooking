import type { Permission } from '@/server/tenancy/permissions'
import type { SettingsNavItem } from './settings-nav'

const ITEMS: Array<SettingsNavItem & { any?: Permission[] }> = [
  { href: '/app/settings', label: 'Business', icon: 'business', any: ['settings.manage'] },
  { href: '/app/settings/booking', label: 'Booking', icon: 'booking', any: ['settings.manage'] },
  { href: '/app/settings/notifications', label: 'Notifications', icon: 'notifications' },
  { href: '/app/settings/team', label: 'Team', icon: 'team', any: ['team.manage'] },
  { href: '/app/settings/account', label: 'Account', icon: 'account' },
  {
    href: '/app/settings/privacy',
    label: 'Privacy & data',
    icon: 'privacy',
    any: ['business.export', 'customers.export', 'business.delete'],
  },
  { href: '/app/settings/activity', label: 'Activity', icon: 'activity', any: ['audit.view'] },
]

/** Settings tabs a member can use (staff members see Notifications and Account only). */
export function visibleSettingsItems(can: (p: Permission) => boolean): SettingsNavItem[] {
  return ITEMS.filter((i) => !i.any || i.any.some((p) => can(p))).map(({ href, label, icon }) => ({
    href,
    label,
    icon,
  }))
}
