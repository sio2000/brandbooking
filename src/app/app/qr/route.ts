import QRCode from 'qrcode'
import { requireTenantAction } from '@/server/tenancy/context'
import { appUrl } from '@/server/env'
import { jsonError } from '@/server/http'

/** QR code for the business's booking page (tagged ?src=qr for attribution). */
export async function GET(req: Request) {
  try {
    const ctx = await requireTenantAction('booking_page.manage')
    const url = new URL(req.url)
    const format = url.searchParams.get('format') === 'png' ? 'png' : 'svg'
    const download = url.searchParams.has('download')
    const target = appUrl(`/book/${ctx.business.slug}?src=qr`)
    const opts = { errorCorrectionLevel: 'M' as const, margin: 2, color: { dark: '#1d1a16', light: '#ffffff' } }
    const headers: Record<string, string> = { 'cache-control': 'private, no-store' }
    if (download) headers['content-disposition'] = `attachment; filename="${ctx.business.slug}-booking-qr.${format}"`
    if (format === 'png') {
      const png = await QRCode.toBuffer(target, { ...opts, width: 1024 })
      return new Response(new Uint8Array(png), { headers: { ...headers, 'content-type': 'image/png' } })
    }
    const svg = await QRCode.toString(target, { ...opts, type: 'svg' })
    return new Response(svg, { headers: { ...headers, 'content-type': 'image/svg+xml', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } })
  } catch (err) {
    return jsonError(err)
  }
}
