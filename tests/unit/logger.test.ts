import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger, redact } from '@/server/observability/logger'

describe('redact: secrets by key name', () => {
  it.each([
    'password',
    'currentPassword',
    'newPassword',
    'pass',
    'token',
    'manageToken',
    'accessToken',
    'refresh_token',
    'tokenHash',
    'secret',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'CRON_SECRET',
    'APP_SECRET',
    'authorization',
    'Authorization',
    'cookie',
    'Cookie',
    'set-cookie',
    'apiKey',
    'api_key',
    'x-api-key',
    'RESEND_API_KEY',
    'stripe-signature',
    'signature',
    'cardNumber',
    'cvc',
    'iban',
    'session',
    'sessionId',
    'passwordHash',
    'SMTP_URL',
    'DATABASE_URL',
  ])('redacts %s', (key) => {
    const out = redact({ [key]: 'sk_live_supersecretvalue' }) as Record<string, unknown>
    expect(out[key]).toBe('[redacted]')
  })

  it('redacts objects under secret keys entirely (not just strings)', () => {
    expect(redact({ session: { id: 'abc', userId: 'u' } })).toEqual({ session: '[redacted]' })
    expect(redact({ token: 12345 })).toEqual({ token: '[redacted]' })
  })

  it('redacts nested and array-contained secrets', () => {
    const out = redact({
      req: { headers: { authorization: 'Bearer abc', cookie: 'hn_session=xyz', 'user-agent': 'UA' } },
      list: [{ password: 'p1' }, { ok: 1 }],
    })
    expect(out).toEqual({
      req: { headers: { authorization: '[redacted]', cookie: '[redacted]', 'user-agent': 'UA' } },
      list: [{ password: '[redacted]' }, { ok: 1 }],
    })
  })

  it('keeps non-sensitive fields intact', () => {
    expect(redact({ businessId: 'b1', status: 200, ms: 12, ok: true, nothing: null })).toEqual({ businessId: 'b1', status: 200, ms: 12, ok: true, nothing: null })
  })

  it('never serialises a Headers instance (no header values leak)', () => {
    const out = JSON.stringify(redact({ h: new Headers({ authorization: 'Bearer leak-me', cookie: 'a=leak-me' }) }))
    expect(out).not.toContain('leak-me')
  })
})

describe('redact: personal data', () => {
  it('masks emails, keeping only the first letter and domain', () => {
    expect(redact({ email: 'jane.doe@example.com' })).toEqual({ email: 'j***@example.com' })
    expect(redact({ recipient: 'bob@example.org' })).toEqual({ recipient: 'b***@example.org' })
  })
  it('masks names, phones, notes and messages', () => {
    expect(redact({ name: 'Olivia', firstName: 'Ann', last_name: 'Lee', phone: '+30 210 1234', notes: 'allergic', message: 'hi there' })).toEqual({
      name: 'O***',
      firstName: 'A***',
      last_name: 'L***',
      phone: '+***',
      notes: 'a***',
      message: 'h***',
    })
  })
  it('fully masks very short values', () => {
    expect(redact({ name: 'Al' })).toEqual({ name: '**' })
    expect(redact({ name: '' })).toEqual({ name: '**' })
  })
})

describe('redact: structure limits', () => {
  it('summarises errors without extra properties', () => {
    const err = Object.assign(new Error('boom'), { password: 'x' })
    const out = redact(err) as Record<string, unknown>
    expect(out.name).toBe('Error')
    expect(out.message).toBe('boom')
    expect(out).not.toHaveProperty('password')
    expect(String(out.stack).split('\n').length).toBeLessThanOrEqual(8)
  })
  it('truncates long strings and arrays and stops at depth', () => {
    expect((redact('x'.repeat(5000)) as string).length).toBe(2001)
    expect((redact(Array.from({ length: 100 }, (_, i) => i)) as unknown[]).length).toBe(50)
    let deep: Record<string, unknown> = { leaf: 1 }
    for (let i = 0; i < 10; i++) deep = { d: deep }
    expect(JSON.stringify(redact(deep))).toContain('[depth]')
  })
})

describe('logger output', () => {
  let err: ReturnType<typeof vi.spyOn>
  let log: ReturnType<typeof vi.spyOn>
  const prev = process.env.LOG_LEVEL
  beforeEach(() => {
    err = vi.spyOn(console, 'error').mockImplementation(() => {})
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    err.mockRestore()
    log.mockRestore()
    if (prev === undefined) delete process.env.LOG_LEVEL
    else process.env.LOG_LEVEL = prev
  })

  it('writes one JSON line with secrets redacted', () => {
    process.env.LOG_LEVEL = 'debug'
    logger.error('login.failed', { email: 'eve@example.com', password: 'hunter2hunter2', headers: { authorization: 'Bearer sk_test_abc' } })
    expect(err).toHaveBeenCalledTimes(1)
    const line = String(err.mock.calls[0]![0])
    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({ level: 'error', msg: 'login.failed', email: 'e***@example.com', password: '[redacted]' })
    expect(line).not.toContain('hunter2')
    expect(line).not.toContain('sk_test_abc')
    expect(line).not.toContain('eve@')
  })

  it('routes info/debug to stdout and respects LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'info'
    logger.debug('hidden')
    logger.info('shown', { n: 1 })
    expect(log).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(log.mock.calls[0]![0]))).toMatchObject({ level: 'info', msg: 'shown', n: 1 })
    process.env.LOG_LEVEL = 'error'
    logger.warn('hidden too')
    expect(err).not.toHaveBeenCalled()
  })
})
