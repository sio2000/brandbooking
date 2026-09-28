import { z } from 'zod'
import { recordFunnelStep } from '@/server/booking/funnel'
import { assertSameOrigin, metaFrom } from '@/server/http'

const schema = z.object({
  step: z.enum(['view', 'service', 'staff', 'date', 'time', 'details', 'confirmed']),
  src: z.string().max(20).nullish(),
  utmSource: z.string().max(100).nullish(),
  utmCampaign: z.string().max(100).nullish(),
  referrerHost: z.string().max(255).nullish(),
})

/** Anonymous funnel beacon. Always 204 so it never affects the booking UI. */
export async function POST(req: Request, ctx: RouteContext<'/api/public/[slug]/events'>) {
  if (!assertSameOrigin(req)) return new Response(null, { status: 204 })
  try {
    const { slug } = await ctx.params
    const body = schema.safeParse(JSON.parse((await req.text()).slice(0, 2000)))
    if (body.success) await recordFunnelStep(slug, body.data, metaFrom(req).ip)
  } catch {
    // ignore
  }
  return new Response(null, { status: 204 })
}
