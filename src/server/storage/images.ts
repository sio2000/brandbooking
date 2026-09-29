import 'server-only'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { uploadedAssets, type AssetKind, type AssetVariants } from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { storage } from './storage'

/**
 * Image upload pipeline. Defends against malicious uploads by:
 *  - bounding request size, and checking extension + declared MIME type,
 *  - decoding with sharp and accepting only real JPEG/PNG/WebP bitmaps (SVG is
 *    rejected outright: it can carry scripts),
 *  - limiting pixel count (decompression bombs) and dimensions,
 *  - re-encoding to WebP with metadata stripped — the original bytes are never
 *    stored or served, which neutralizes polyglot files and EXIF leaks.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp'])
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp'])
const MAX_PIXELS = 40_000_000

type Spec = {
  minWidth: number
  minHeight: number
  variants: Record<string, { width: number; height?: number; fit: 'inside' | 'cover' }>
}

export const IMAGE_SPECS: Record<AssetKind, Spec> = {
  logo: {
    minWidth: 64,
    minHeight: 64,
    variants: {
      main: { width: 512, height: 512, fit: 'inside' },
      sm: { width: 128, height: 128, fit: 'inside' },
    },
  },
  cover: {
    minWidth: 800,
    minHeight: 200,
    variants: {
      main: { width: 1920, height: 1080, fit: 'inside' },
      sm: { width: 960, height: 540, fit: 'inside' },
    },
  },
  avatar: {
    minWidth: 96,
    minHeight: 96,
    variants: {
      main: { width: 256, height: 256, fit: 'cover' },
      sm: { width: 96, height: 96, fit: 'cover' },
    },
  },
}

export type ValidatedImage = { buffer: Buffer; width: number; height: number }

export async function validateImage(file: File, kind: AssetKind): Promise<ValidatedImage> {
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD_BYTES)
    throw new AppError('upload_invalid')
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(file.type)) throw new AppError('upload_invalid')
  const buffer = Buffer.from(await file.arrayBuffer())
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata()
  } catch {
    throw new AppError('upload_invalid')
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format) || !meta.width || !meta.height)
    throw new AppError('upload_invalid')
  const spec = IMAGE_SPECS[kind]
  if (meta.width < spec.minWidth || meta.height < spec.minHeight) {
    // Translated for the browser from the code and { min } (src/server/actions.ts).
    throw new AppError('upload_too_small', { vars: { min: spec.minWidth } })
  }
  if (meta.width > 12_000 || meta.height > 12_000) throw new AppError('upload_invalid')
  return { buffer, width: meta.width, height: meta.height }
}

export async function storeImage(
  businessId: string,
  kind: AssetKind,
  image: ValidatedImage,
  userId: string,
) {
  const spec = IMAGE_SPECS[kind]
  const id = randomUUID()
  const variants: AssetVariants = {}
  let mainBytes = 0
  for (const [name, v] of Object.entries(spec.variants)) {
    const out = await sharp(image.buffer, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: v.width, height: v.height, fit: v.fit, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })
    const key = `b/${businessId}/${kind}/${id}-${name}.webp`
    await storage().put(key, out.data, 'image/webp')
    variants[name] = { key, width: out.info.width, height: out.info.height }
    if (name === 'main') mainBytes = out.info.size
  }
  const main = variants.main!
  const [row] = await db()
    .insert(uploadedAssets)
    .values({
      id,
      businessId,
      kind,
      storageKey: main.key,
      contentType: 'image/webp',
      byteSize: mainBytes,
      width: main.width,
      height: main.height,
      variants,
      createdBy: userId,
    })
    .returning()
  return row!
}

export async function deleteAsset(businessId: string, assetId: string) {
  const [row] = await db()
    .delete(uploadedAssets)
    .where(and(eq(uploadedAssets.businessId, businessId), eq(uploadedAssets.id, assetId)))
    .returning()
  if (!row) return
  for (const v of Object.values(row.variants))
    await storage()
      .delete(v.key)
      .catch(() => {})
}

export async function assetUrl(
  businessId: string,
  assetId: string | null | undefined,
  variant: 'main' | 'sm' = 'main',
) {
  if (!assetId) return null
  const [row] = await db()
    .select({ variants: uploadedAssets.variants })
    .from(uploadedAssets)
    .where(and(eq(uploadedAssets.businessId, businessId), eq(uploadedAssets.id, assetId)))
    .limit(1)
  const v = row?.variants[variant] ?? row?.variants.main
  return v ? storage().publicUrl(v.key) : null
}

export async function assetUrls(
  businessId: string,
  ids: Array<string | null | undefined>,
  variant: 'main' | 'sm' = 'main',
) {
  const out = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean) as string[])]
  if (unique.length === 0) return out
  const rows = await db()
    .select({ id: uploadedAssets.id, variants: uploadedAssets.variants })
    .from(uploadedAssets)
    .where(and(eq(uploadedAssets.businessId, businessId), inArray(uploadedAssets.id, unique)))
  for (const r of rows) {
    const v = r.variants[variant] ?? r.variants.main
    if (v) out.set(r.id, storage().publicUrl(v.key))
  }
  return out
}
