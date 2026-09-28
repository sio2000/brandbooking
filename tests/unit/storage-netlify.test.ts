import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BlobsServer } from '@netlify/blobs/server'
import { setEnvironmentContext } from '@netlify/blobs'
import { resetEnvCache } from '@/server/env'
import { storage } from '@/server/storage/storage'

// Runs the Netlify Blobs driver against Netlify's own local Blobs server.
let dir: string
let server: BlobsServer
const saved = { ...process.env }

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'hn-blobs-'))
  server = new BlobsServer({ directory: dir, token: 'local-token' })
  const { port } = await server.start()
  setEnvironmentContext({
    apiURL: `http://localhost:${port}`,
    edgeURL: `http://localhost:${port}`,
    uncachedEdgeURL: `http://localhost:${port}`,
    siteID: 'site-test',
    token: 'local-token',
  })
  process.env.DATABASE_URL ??= 'postgres://unused@localhost:1/unused_test'
  process.env.HN_PLATFORM = 'netlify'
  delete process.env.STORAGE_DRIVER
  process.env.APP_URL = 'https://book.example.com'
  resetEnvCache()
})
afterAll(async () => {
  process.env = saved
  resetEnvCache()
  await server.stop()
  await rm(dir, { recursive: true, force: true })
})

describe('Netlify Blobs storage', () => {
  const key =
    'b/00000000-0000-4000-8000-000000000001/logo/00000000-0000-4000-8000-000000000002-main.webp'

  it('stores, reads back with content type, and deletes', async () => {
    const body = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0xff])
    await storage().put(key, body, 'image/webp')
    const got = await storage().get(key)
    expect(got?.contentType).toBe('image/webp')
    expect(Buffer.compare(got!.body, body)).toBe(0)
    expect(storage().publicUrl(key)).toBe(`https://book.example.com/media/${key}`)
    await storage().delete(key)
    expect(await storage().get(key)).toBeNull()
  })

  it('rejects unsafe keys before touching the store', async () => {
    await expect(storage().put('../escape', Buffer.from('x'), 'image/webp')).rejects.toThrow(
      /Invalid storage key/,
    )
    await expect(storage().get('a//b')).rejects.toThrow(/Invalid storage key/)
  })
})
