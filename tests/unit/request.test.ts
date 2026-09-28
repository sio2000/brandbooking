import { afterEach, describe, expect, it } from 'vitest'
import { clientIpFrom } from '@/server/request'

const saved = { platform: process.env.HN_PLATFORM, trust: process.env.TRUST_PROXY }
afterEach(() => {
  process.env.HN_PLATFORM = saved.platform
  process.env.TRUST_PROXY = saved.trust
  if (saved.platform === undefined) delete process.env.HN_PLATFORM
  if (saved.trust === undefined) delete process.env.TRUST_PROXY
})

describe('clientIpFrom', () => {
  it('ignores forwarding headers unless a proxy is trusted', () => {
    delete process.env.TRUST_PROXY
    delete process.env.HN_PLATFORM
    const h = new Headers({ 'x-forwarded-for': '1.2.3.4', 'x-nf-client-connection-ip': '5.6.7.8' })
    expect(clientIpFrom(h)).toBe('local')
  })

  it('uses the first X-Forwarded-For hop behind a trusted proxy', () => {
    process.env.TRUST_PROXY = 'true'
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4')
    expect(clientIpFrom(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9')
  })

  it("uses Netlify's client connection IP on Netlify", () => {
    process.env.HN_PLATFORM = 'netlify'
    delete process.env.TRUST_PROXY
    const h = new Headers({ 'x-forwarded-for': '1.2.3.4', 'x-nf-client-connection-ip': '5.6.7.8' })
    expect(clientIpFrom(h)).toBe('5.6.7.8')
  })
})
