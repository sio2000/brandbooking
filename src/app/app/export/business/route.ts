import { requireTenantAction } from '@/server/tenancy/context'
import { exportBusinessJson } from '@/server/business/exports'
import { jsonError, metaFrom } from '@/server/http'

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantAction('business.export')
    const json = await exportBusinessJson(ctx, metaFrom(req))
    return new Response(json, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${ctx.business.slug}-export.json"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}
