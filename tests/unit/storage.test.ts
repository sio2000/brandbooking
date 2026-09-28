import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { resetEnvCache } from '@/server/env'
import { assertSafeKey, storage } from '@/server/storage/storage'

let root: string
let outside: string
const saved = { ...process.env }

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hn-storage-'))
  outside = await mkdtemp(path.join(tmpdir(), 'hn-outside-'))
  await writeFile(path.join(outside, 'secret.txt'), 'top secret')
  process.env.DATABASE_URL ??= 'postgres://unused@localhost:1/unused_test'
  process.env.STORAGE_DRIVER = 'local'
  process.env.STORAGE_LOCAL_DIR = root
  process.env.APP_URL = 'https://book.example.com'
  resetEnvCache()
})
afterAll(async () => {
  process.env = saved
  resetEnvCache()
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('assertSafeKey', () => {
  it.each(['biz/abc/logo.webp', 'b1/2/cover-640.webp', 'ab', 'a_b.c-d/e.png'])(
    'accepts %s',
    (key) => {
      expect(() => assertSafeKey(key)).not.toThrow()
    },
  )

  it.each([
    ['empty', ''],
    ['single char', 'a'],
    ['parent traversal', '../etc/passwd'],
    ['embedded traversal', 'biz/../../etc/passwd'],
    ['trailing traversal', 'biz/..'],
    ['dot-dot inside a name', 'biz/a..b'],
    ['absolute path', '/etc/passwd'],
    ['double slash', 'biz//x.webp'],
    ['backslash', 'biz\\..\\x'],
    ['upper case', 'Biz/x.webp'],
    ['leading dot', '.env'],
    ['leading dash', '-rf'],
    ['percent-encoded traversal', 'biz/%2e%2e/x'],
    ['null byte', 'biz/x.webp\0.png'],
    ['newline', 'biz/x\n.webp'],
    ['space', 'biz/x y.webp'],
    ['query string', 'biz/x.webp?a=1'],
    ['too long', 'a'.repeat(202)],
  ])('rejects %s', (_label, key) => {
    expect(() => assertSafeKey(key)).toThrow('Invalid storage key')
  })
})

describe('local storage driver', () => {
  it('round-trips objects and infers the content type from the extension', async () => {
    const s = storage()
    await s.put('biz1/a/logo.webp', Buffer.from('webp-bytes'), 'image/webp')
    await s.put('biz1/a/raw.png', Buffer.from('png-bytes'), 'image/png')
    await s.put('biz1/a/unknown.bin', Buffer.from('x'), 'application/x')
    expect(await s.get('biz1/a/logo.webp')).toEqual({
      body: Buffer.from('webp-bytes'),
      contentType: 'image/webp',
    })
    expect((await s.get('biz1/a/raw.png'))?.contentType).toBe('image/png')
    expect((await s.get('biz1/a/unknown.bin'))?.contentType).toBe('application/octet-stream')
  })

  it('writes only inside the storage root', async () => {
    await storage().put('biz2/x.webp', Buffer.from('1'), 'image/webp')
    expect(await readdir(path.join(root, 'biz2'))).toEqual(['x.webp'])
  })

  it('returns null for missing objects and deletes idempotently', async () => {
    const s = storage()
    expect(await s.get('biz1/missing.webp')).toBeNull()
    await s.put('biz1/tmp.webp', Buffer.from('t'), 'image/webp')
    await s.delete('biz1/tmp.webp')
    expect(await s.get('biz1/tmp.webp')).toBeNull()
    await expect(s.delete('biz1/tmp.webp')).resolves.toBeUndefined()
  })

  it('cannot read files outside the root', async () => {
    const rel = path.relative(root, path.join(outside, 'secret.txt'))
    expect(rel.startsWith('..')).toBe(true)
    expect(await storage().get(rel)).toBeNull()
    expect(await storage().get(path.join(outside, 'secret.txt'))).toBeNull()
  })

  it('refuses to write or delete outside the root', async () => {
    const rel = path.relative(root, path.join(outside, 'pwned.webp'))
    await expect(storage().put(rel, Buffer.from('x'), 'image/webp')).rejects.toThrow(
      'Invalid storage key',
    )
    await expect(
      storage().delete(path.relative(root, path.join(outside, 'secret.txt'))),
    ).rejects.toThrow('Invalid storage key')
    expect((await readdir(outside)).sort()).toEqual(['secret.txt'])
  })

  it('builds public URLs through the /media proxy on APP_URL', () => {
    expect(storage().publicUrl('biz1/a/logo.webp')).toBe(
      'https://book.example.com/media/biz1/a/logo.webp',
    )
  })
})
