import { NextResponse } from 'next/server'
import { availabilityQuerySchema } from '@/lib/validation/booking'
import { publicAvailability } from '@/server/booking/public'
import { jsonError, metaFrom } from '@/server/http'
import { optionalTenant } from '@/server/tenancy/context'

export async function GET(req: Request, ctx: RouteContext<'/api/public/[slug]/availability'>) {
  const meta = metaFrom(req)
  try {
    const { slug } = await ctx.params
    const q = availabilityQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams))
    // Owners/managers previewing their unpublished page see real availability.
    // Only signed-in requests carry a session cookie; anonymous traffic skips the lookup.
    const tenant = req.headers.get('cookie') ? await optionalTenant() : null
    const previewId = tenant?.can('booking_page.manage') ? tenant.business.id : null
    const data = await publicAvailability(slug, q, meta, previewId)
    return NextResponse.json({ ok: true, data }, { headers: { 'cache-control': 'no-store' } })
  } catch (err) {
    return jsonError(err, meta.requestId)
  }
}
