import 'server-only'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AwsClient } from 'aws4fetch'
import { env, appUrl } from '@/server/env'

/**
 * Object storage abstraction. Local disk for development / single-server
 * deployments; any S3-compatible service (AWS S3, Cloudflare R2, Backblaze B2,
 * MinIO) in production. Business logic never touches the driver directly.
 */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>
  delete(key: string): Promise<void>
  publicUrl(key: string): string
}

const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{1,200}$/

export function assertSafeKey(key: string) {
  if (!KEY_RE.test(key) || key.includes('..') || key.includes('//'))
    throw new Error('Invalid storage key')
}

const CONTENT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}

class LocalStorage implements ObjectStorage {
  constructor(private readonly root: string) {}
  private file(key: string) {
    assertSafeKey(key)
    const full = path.resolve(this.root, key)
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Invalid storage key')
    return full
  }
  async put(key: string, body: Buffer) {
    const f = this.file(key)
    await mkdir(path.dirname(f), { recursive: true })
    await writeFile(f, body)
  }
  async get(key: string) {
    try {
      const body = await readFile(this.file(key))
      const ext = key.split('.').pop() ?? ''
      return { body, contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream' }
    } catch {
      return null
    }
  }
  async delete(key: string) {
    await rm(this.file(key), { force: true })
  }
  publicUrl(key: string) {
    return appUrl(`/media/${key}`)
  }
}

class S3Storage implements ObjectStorage {
  private client: AwsClient
  constructor(
    private readonly endpoint: string,
    private readonly bucket: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    private readonly publicBase?: string,
  ) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, region, service: 's3' })
  }
  private url(key: string) {
    assertSafeKey(key)
    return `${this.endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`
  }
  async put(key: string, body: Buffer, contentType: string) {
    const res = await this.client.fetch(this.url(key), {
      method: 'PUT',
      body: new Uint8Array(body),
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=31536000, immutable',
      },
    })
    if (!res.ok) throw new Error(`Storage upload failed (${res.status})`)
  }
  async get(key: string) {
    const res = await this.client.fetch(this.url(key))
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Storage read failed (${res.status})`)
    return {
      body: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    }
  }
  async delete(key: string) {
    const res = await this.client.fetch(this.url(key), { method: 'DELETE' })
    if (!res.ok && res.status !== 404) throw new Error(`Storage delete failed (${res.status})`)
  }
  publicUrl(key: string) {
    // Serve directly from a public bucket/CDN when configured; otherwise proxy via /media.
    return this.publicBase
      ? `${this.publicBase.replace(/\/$/, '')}/${key}`
      : appUrl(`/media/${key}`)
  }
}

let instance: ObjectStorage | undefined
export function storage(): ObjectStorage {
  if (instance) return instance
  const e = env()
  instance =
    e.STORAGE_DRIVER === 's3'
      ? new S3Storage(
          e.S3_ENDPOINT!,
          e.S3_BUCKET!,
          e.S3_REGION,
          e.S3_ACCESS_KEY_ID!,
          e.S3_SECRET_ACCESS_KEY!,
          e.S3_PUBLIC_URL,
        )
      : new LocalStorage(path.resolve(/*turbopackIgnore: true*/ process.cwd(), e.STORAGE_LOCAL_DIR))
  return instance
}
