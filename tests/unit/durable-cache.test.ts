import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Stands in for Next's data cache: one stored value per key, counted reads. */
const store = new Map<string, unknown>()
const calls: { key: string[]; options: unknown }[] = []
let available = true
let failing: Error | null = null

vi.mock('next/cache', () => ({
  unstable_cache: (load: () => Promise<unknown>, key: string[], options: unknown) => {
    if (!available) throw new Error('Invariant: incrementalCache missing in unstable_cache')
    return async () => {
      calls.push({ key, options })
      if (failing) throw failing
      const id = key.join('/')
      if (!store.has(id)) store.set(id, await load())
      return store.get(id)
    }
  },
}))

const { durable } = await import('@/server/durable-cache')

beforeEach(() => {
  store.clear()
  calls.length = 0
  available = true
  failing = null
})

describe('durable cache', () => {
  it('asks the database once, however many visits follow', async () => {
    const load = vi.fn(async () => ({ cents: 1000 }))
    for (let visit = 0; visit < 5; visit++) {
      expect(await durable(['price', 'live'], load, { seconds: 60, tags: ['price'] })).toEqual({
        cents: 1000,
      })
    }
    expect(load).toHaveBeenCalledTimes(1)
    expect(calls[0]).toEqual({
      key: ['price', 'live'],
      options: { revalidate: 60, tags: ['price'] },
    })
  })

  it('keeps separate values per key', async () => {
    expect(await durable(['price', 'test'], async () => 1, { seconds: 60 })).toBe(1)
    expect(await durable(['price', 'live'], async () => 2, { seconds: 60 })).toBe(2)
    expect(await durable(['price', 'test'], async () => 3, { seconds: 60 })).toBe(1)
  })

  it('without a data cache (tests, scripts) reads directly, as before', async () => {
    available = false
    const load = vi.fn(async () => 'fresh')
    expect(await durable(['k'], load, { seconds: 60 })).toBe('fresh')
    expect(await durable(['k'], load, { seconds: 60 })).toBe('fresh')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('a failing cache falls back to a direct read; a failing database still throws', async () => {
    failing = new Error('blob store unreachable')
    expect(await durable(['k'], async () => 'direct', { seconds: 60 })).toBe('direct')
    await expect(
      durable(
        ['k'],
        async () => {
          throw new Error('database down')
        },
        { seconds: 60 },
      ),
    ).rejects.toThrow('database down')
  })

  it("lets Next's own control-flow errors through", async () => {
    failing = Object.assign(new Error('dynamic'), { digest: 'DYNAMIC_SERVER_USAGE' })
    const load = vi.fn(async () => 'never')
    await expect(durable(['k'], load, { seconds: 60 })).rejects.toThrow('dynamic')
    expect(load).not.toHaveBeenCalled()
  })
})
