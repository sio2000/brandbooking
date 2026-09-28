import { NextResponse } from 'next/server'
import { z } from 'zod'
import { managedAvailability } from '@/server/booking/public'
import { jsonError, metaFrom } from '@/server/http'

const q = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

export async function GET(req: Request, ctx: RouteContext<'/api/manage/[token]/availability'>) {
  const meta = metaFrom(req)
  try {
    const { token } = await ctx.params
    const { from, to } = q.parse(Object.fromEntries(new URL(req.url).searchParams))
    return NextResponse.json(
      { ok: true, data: await managedAvailability(token, { from, to, staffId: null }, meta) },
      { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    )
  } catch (err) {
    return jsonError(err, meta.requestId)
  }
}
