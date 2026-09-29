import type { Permission } from '@/server/tenancy/permissions'
import type { SettingsNavItem } from './settings-nav'

/** Tab labels come from the `app-settings` catalogue (`nav.<icon>`). */
const ITEMS: Array<SettingsNavItem & { any?: Permission[] }> = [
  { href: '/app/settings', icon: 'business', any: ['settings.manage'] },
  { href: '/app/settings/booking', icon: 'booking', any: ['settings.manage'] },
  { href: '/app/settings/notifications', icon: 'notifications' },
  { href: '/app/settings/team', icon: 'team', any: ['team.manage'] },
  { href: '/app/settings/account', icon: 'account' },
  {
    href: '/app/settings/privacy',
    icon: 'privacy',
    any: ['business.export', 'customers.export', 'business.delete'],
  },
  { href: '/app/settings/activity', icon: 'activity', any: ['audit.view'] },
]

/** Settings tabs a member can use (staff members see Notifications and Account only). */
export function visibleSettingsItems(can: (p: Permission) => boolean): SettingsNavItem[] {
  return ITEMS.filter((i) => !i.any || i.any.some((p) => can(p))).map(({ href, icon }) => ({
    href,
    icon,
  }))
}
