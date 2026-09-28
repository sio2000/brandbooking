import { storage } from '@/server/storage/storage'

/**
 * Serves uploaded images from storage (local driver, or S3 without a public
 * URL). Only our own re-encoded WebP files exist in storage, and they're served
 * with nosniff + a locked-down CSP so nothing can execute.
 */
export async function GET(_req: Request, ctx: RouteContext<'/media/[...key]'>) {
  const { key } = await ctx.params
  const path = key.join('/')
  if (!/^b\/[0-9a-f-]{36}\/(logo|cover|avatar)\/[0-9a-f-]{36}-(main|sm)\.webp$/.test(path))
    return new Response('Not found', { status: 404 })
  const obj = await storage()
    .get(path)
    .catch(() => null)
  if (!obj) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(obj.body), {
    headers: {
      'content-type': 'image/webp',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'cross-origin-resource-policy': 'cross-origin',
    },
  })
}
