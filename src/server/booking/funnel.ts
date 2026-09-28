import 'server-only'
import { db } from '@/server/db/client'
import { bookingPageEvents, type FunnelStep } from '@/server/db/schema'
import { checkRateLimit, POLICIES } from '@/server/security/rate-limit'
import { deriveSource } from '@/lib/validation/booking'
import { findPublicBusiness, isPubliclyVisible } from './public'

/**
 * Anonymous funnel measurement for the booking page: no cookies, no device
 * identifiers, no personal data — just (business, step, source, time). This
 * needs no consent banner under ePrivacy rules because nothing is stored on
 * the visitor's device.
 */
export async function recordFunnelStep(
  slug: string,
  input: { step: FunnelStep; src?: string | null; utmSource?: string | null; utmCampaign?: string | null; referrerHost?: string | null },
  ip: string,
) {
  const limit = await checkRateLimit(`funnel:ip:${ip}`, POLICIES.funnelByIp)
  if (!limit.ok) return
  const b = await findPublicBusiness(slug)
  if (!b || !isPubliclyVisible(b)) return
  await db().insert(bookingPageEvents).values({
    businessId: b.id,
    step: input.step,
    source: deriveSource(input),
    utmCampaign: input.utmCampaign?.slice(0, 100) || null,
  })
}
