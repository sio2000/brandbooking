import { afterEach, describe, expect, it } from 'vitest'
import { isBootstrapAdmin } from '@/server/auth/session'

const saved = process.env.PLATFORM_ADMIN_EMAILS
afterEach(() => {
  if (saved === undefined) delete process.env.PLATFORM_ADMIN_EMAILS
  else process.env.PLATFORM_ADMIN_EMAILS = saved
})

describe('PLATFORM_ADMIN_EMAILS', () => {
  it('grants admin only to listed, verified accounts (case-insensitive)', () => {
    process.env.PLATFORM_ADMIN_EMAILS = ' Owner@Example.com , ops@example.com'
    expect(isBootstrapAdmin('owner@example.com', new Date())).toBe(true)
    expect(isBootstrapAdmin('OPS@example.com', new Date())).toBe(true)
    expect(isBootstrapAdmin('owner@example.com', null)).toBe(false)
    expect(isBootstrapAdmin('someone@example.com', new Date())).toBe(false)
  })

  it('grants nothing when unset or empty', () => {
    delete process.env.PLATFORM_ADMIN_EMAILS
    expect(isBootstrapAdmin('owner@example.com', new Date())).toBe(false)
    process.env.PLATFORM_ADMIN_EMAILS = ' , '
    expect(isBootstrapAdmin('', new Date())).toBe(false)
  })
})
