/**
 * Role-based permissions for business members. Pure data + functions so it can
 * be unit-tested exhaustively and used by both server authorization and UI
 * (hiding controls a user cannot use — never as the only check).
 */
import type { MemberRole } from '@/server/db/schema'

export const PERMISSIONS = [
  'appointments.view_all',
  'appointments.manage_all',
  'appointments.view_own',
  'appointments.manage_own',
  'customers.view',
  'customers.manage',
  'customers.export',
  'customers.erase',
  'services.manage',
  'staff.manage',
  'availability.manage',
  'availability.manage_own',
  'analytics.view',
  'booking_page.manage',
  'settings.manage',
  'team.manage',
  'billing.view',
  'billing.manage',
  'business.export',
  'business.delete',
  'audit.view',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const OWNER: readonly Permission[] = PERMISSIONS

const MANAGER: readonly Permission[] = PERMISSIONS.filter(
  (p) => !['billing.manage', 'business.delete', 'business.export', 'customers.erase'].includes(p),
)

const STAFF: readonly Permission[] = [
  'appointments.view_own',
  'appointments.manage_own',
  'customers.view',
  'availability.manage_own',
]

const MATRIX: Record<MemberRole, ReadonlySet<Permission>> = {
  owner: new Set(OWNER),
  manager: new Set(MANAGER),
  staff: new Set(STAFF),
}

export function roleCan(role: MemberRole, permission: Permission): boolean {
  return MATRIX[role].has(permission)
}

export function permissionsFor(role: MemberRole): Permission[] {
  return [...MATRIX[role]]
}

/** Roles a member may assign when inviting or changing roles. */
export function assignableRoles(role: MemberRole): MemberRole[] {
  if (role === 'owner') return ['manager', 'staff']
  if (role === 'manager') return ['staff']
  return []
}

/** Permissions that remain usable while a business is suspended. */
export const ALLOWED_WHILE_SUSPENDED: ReadonlySet<Permission> = new Set([
  'billing.view',
  'billing.manage',
  'business.export',
  'business.delete',
  'appointments.view_all',
  'appointments.view_own',
  'customers.view',
  'customers.export',
  'analytics.view',
  'audit.view',
])

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Team member',
}
