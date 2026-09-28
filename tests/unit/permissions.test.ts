import { describe, expect, it } from 'vitest'
import {
  ALLOWED_WHILE_SUSPENDED,
  PERMISSIONS,
  ROLE_LABELS,
  assignableRoles,
  permissionsFor,
  roleCan,
  type Permission,
} from '@/server/tenancy/permissions'
import type { MemberRole } from '@/server/db/schema'

const ROLES: MemberRole[] = ['owner', 'manager', 'staff']
const OWNER_ONLY: Permission[] = ['billing.manage', 'business.delete', 'business.export', 'customers.erase']
const STAFF: Permission[] = ['appointments.view_own', 'appointments.manage_own', 'customers.view', 'availability.manage_own']

describe('role matrix', () => {
  it('owner holds every permission', () => {
    for (const p of PERMISSIONS) expect(roleCan('owner', p), p).toBe(true)
    expect(new Set(permissionsFor('owner'))).toEqual(new Set(PERMISSIONS))
  })

  it('manager holds everything except owner-only permissions', () => {
    for (const p of PERMISSIONS) expect(roleCan('manager', p), p).toBe(!OWNER_ONLY.includes(p))
    expect(permissionsFor('manager')).toHaveLength(PERMISSIONS.length - OWNER_ONLY.length)
  })

  it('staff hold exactly the self-service permissions', () => {
    expect(new Set(permissionsFor('staff'))).toEqual(new Set(STAFF))
    for (const p of PERMISSIONS) expect(roleCan('staff', p), p).toBe(STAFF.includes(p))
  })

  it.each([
    'appointments.view_all',
    'appointments.manage_all',
    'customers.manage',
    'customers.export',
    'services.manage',
    'staff.manage',
    'availability.manage',
    'analytics.view',
    'booking_page.manage',
    'settings.manage',
    'team.manage',
    'billing.view',
    'audit.view',
  ] as const)('staff cannot %s', (p) => {
    expect(roleCan('staff', p)).toBe(false)
  })

  it('roles are strictly nested: staff ⊂ manager ⊂ owner', () => {
    const owner = new Set(permissionsFor('owner'))
    const manager = new Set(permissionsFor('manager'))
    for (const p of permissionsFor('staff')) expect(manager.has(p), p).toBe(true)
    for (const p of manager) expect(owner.has(p), p).toBe(true)
    expect(manager.size).toBeLessThan(owner.size)
  })

  it('permissionsFor returns a copy that cannot mutate the matrix', () => {
    const list = permissionsFor('staff')
    list.push('business.delete')
    expect(roleCan('staff', 'business.delete')).toBe(false)
    expect(permissionsFor('staff')).not.toContain('business.delete')
  })

  it('has a label for every role and no duplicate permissions', () => {
    for (const r of ROLES) expect(ROLE_LABELS[r]).toBeTruthy()
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length)
  })
})

describe('assignableRoles (privilege escalation)', () => {
  it('owner may assign manager and staff but never owner', () => {
    expect(assignableRoles('owner')).toEqual(['manager', 'staff'])
  })
  it('manager may only assign staff', () => {
    expect(assignableRoles('manager')).toEqual(['staff'])
  })
  it('staff may assign nothing', () => {
    expect(assignableRoles('staff')).toEqual([])
  })
  it('no role can ever assign the owner role', () => {
    for (const r of ROLES) expect(assignableRoles(r)).not.toContain('owner')
  })
  it('no role can assign a role above its own', () => {
    const rank: Record<MemberRole, number> = { staff: 0, manager: 1, owner: 2 }
    for (const r of ROLES) for (const a of assignableRoles(r)) expect(rank[a]).toBeLessThan(rank[r])
  })
})

describe('permissions while suspended', () => {
  it('is a subset of the known permissions', () => {
    for (const p of ALLOWED_WHILE_SUSPENDED) expect(PERMISSIONS).toContain(p)
  })
  it('keeps read, export, billing and deletion available (data is never held hostage)', () => {
    for (const p of ['billing.view', 'billing.manage', 'business.export', 'business.delete', 'appointments.view_all', 'appointments.view_own', 'customers.view', 'customers.export', 'analytics.view', 'audit.view'] as const) {
      expect(ALLOWED_WHILE_SUSPENDED.has(p), p).toBe(true)
    }
  })
  it('blocks every operational write', () => {
    for (const p of [
      'appointments.manage_all',
      'appointments.manage_own',
      'customers.manage',
      'services.manage',
      'staff.manage',
      'availability.manage',
      'availability.manage_own',
      'booking_page.manage',
      'settings.manage',
      'team.manage',
    ] as const) {
      expect(ALLOWED_WHILE_SUSPENDED.has(p), p).toBe(false)
    }
  })
})
