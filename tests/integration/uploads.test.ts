import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { uploadedAssets } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import { meta, setupBusiness, type Setup } from '../helpers/factory'
import { uploadBusinessImage } from '@/server/business/profile'
import { storage } from '@/server/storage/storage'
import { AppError } from '@/server/errors'

let s: Setup

async function png(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 15, g: 118, b: 110 } } })
    .png()
    .toBuffer()
}

const file = (bytes: Buffer | string, name: string, type: string) =>
  new File([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], name, { type })

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

beforeEach(async () => {
  await resetDatabase()
  s = await setupBusiness()
})
afterAll(async () => {
  await closeDb()
})

describe('image uploads', () => {
  it('re-encodes valid images to WebP variants and strips the original', async () => {
    const asset = await uploadBusinessImage(
      s.ctx,
      'logo',
      file(await png(800, 600), 'logo.png', 'image/png'),
      meta(),
    )
    expect(asset.contentType).toBe('image/webp')
    expect(asset.width).toBeLessThanOrEqual(512)
    expect(Object.keys(asset.variants).sort()).toEqual(['main', 'sm'])
    const stored = await storage().get(asset.variants.main!.key)
    const m = await sharp(stored!.body).metadata()
    expect(m.format).toBe('webp')
    expect(m.exif).toBeUndefined()
  })

  it('rejects SVG (script-capable) files', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="100" height="100"/></svg>'
    await expectCode(
      uploadBusinessImage(s.ctx, 'logo', file(svg, 'logo.svg', 'image/svg+xml'), meta()),
      'upload_invalid',
    )
    await expectCode(
      uploadBusinessImage(s.ctx, 'logo', file(svg, 'logo.png', 'image/png'), meta()),
      'upload_invalid',
    )
  })

  it('rejects files whose content does not match the claimed type', async () => {
    await expectCode(
      uploadBusinessImage(s.ctx, 'logo', file('<?php echo 1; ?>', 'logo.png', 'image/png'), meta()),
      'upload_invalid',
    )
    await expectCode(
      uploadBusinessImage(
        s.ctx,
        'logo',
        file(await png(200, 200), 'logo.html', 'text/html'),
        meta(),
      ),
      'upload_invalid',
    )
  })

  it('rejects oversized and undersized images', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 1)
    await expectCode(
      uploadBusinessImage(s.ctx, 'logo', file(big, 'big.png', 'image/png'), meta()),
      'upload_invalid',
    )
    await expectCode(
      uploadBusinessImage(
        s.ctx,
        'cover',
        file(await png(300, 100), 'cover.png', 'image/png'),
        meta(),
      ),
      'upload_too_small',
    )
  })

  it('replacing a logo deletes the previous asset', async () => {
    const a1 = await uploadBusinessImage(
      s.ctx,
      'logo',
      file(await png(300, 300), 'a.png', 'image/png'),
      meta(),
    )
    const refreshed = { ...s.ctx, business: { ...s.ctx.business, logoAssetId: a1.id } }
    await uploadBusinessImage(
      refreshed,
      'logo',
      file(await png(300, 300), 'b.png', 'image/png'),
      meta(),
    )
    const rows = await db()
      .select()
      .from(uploadedAssets)
      .where(eq(uploadedAssets.businessId, s.ctx.business.id))
    expect(rows).toHaveLength(1)
    expect(await storage().get(a1.variants.main!.key)).toBeNull()
  })

  it('refuses path traversal in storage keys', async () => {
    await expect(storage().get('../../etc/passwd')).resolves.toBeNull()
    await expect(storage().put('../escape.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow()
  })
})
