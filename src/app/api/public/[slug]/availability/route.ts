import { NextResponse } from 'next/server'
import { availabilityQuerySchema } from '@/lib/validation/booking'
import { publicAvailability } from '@/server/booking/public'
import { jsonError, metaFrom } from '@/server/http'

export async function GET(req: Request, ctx: RouteContext<'/api/public/[slug]/availability'>) {
  const meta = metaFrom(req)
  try {
    const { slug } = await ctx.params
    const q = availabilityQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams))
    const data = await publicAvailability(slug, q, meta)
    return NextResponse.json({ ok: true, data }, { headers: { 'cache-control': 'no-store' } })
  } catch (err) {
    return jsonError(err, meta.requestId)
  }
}
