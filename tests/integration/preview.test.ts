import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { businesses } from '@/server/db/schema'
import { createPublicBooking, publicAvailability } from '@/server/booking/public'
import { localToDate } from '@/lib/tz'
import { resetDatabase } from '../helpers/db'
import { futureDate, meta, setupBusiness, type Setup } from '../helpers/factory'

let s: Setup
beforeEach(async () => {
  await resetDatabase()
  s = await setupBusiness()
  await db()
    .update(businesses)
    .set({ publishStatus: 'draft' })
    .where(eq(businesses.id, s.ctx.business.id))
})
afterAll(() => closeDb())

const q = () => ({ serviceId: s.serviceId, staffId: null })

describe('previewing an unpublished booking page', () => {
  it('hides availability from the public', async () => {
    await expect(publicAvailability(s.ctx.business.slug, q(), meta())).rejects.toMatchObject({
      code: 'booking_page_unavailable',
    })
  })

  it("shows the owner's real availability in preview", async () => {
    const r = await publicAvailability(s.ctx.business.slug, q(), meta(), s.ctx.business.id)
    expect(r.days.some((d) => d.slots.length > 0)).toBe(true)
  })

  it('does not let a member of another business preview it', async () => {
    const other = await setupBusiness()
    await expect(
      publicAvailability(s.ctx.business.slug, q(), meta(), other.ctx.business.id),
    ).rejects.toMatchObject({ code: 'booking_page_unavailable' })
  })

  it('still refuses real bookings until the page is published', async () => {
    const date = futureDate(s.ctx.business.timezone, 3)
    await expect(
      createPublicBooking(
        s.ctx.business.slug,
        {
          serviceId: s.serviceId,
          staffId: null,
          start: localToDate(date, 600, s.ctx.business.timezone).toISOString(),
          firstName: 'Pre',
          lastName: 'View',
          email: 'preview@example.com',
          phone: '+30 210 1234567',
          message: null,
          src: null,
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          referrerHost: null,
          website: null,
        },
        meta(),
      ),
    ).rejects.toMatchObject({ code: 'booking_page_unavailable' })
  })
})
