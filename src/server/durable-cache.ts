import 'server-only'
import { unstable_cache } from 'next/cache'

/**
 * Read through Next's data cache, which outlives a server instance (on Netlify
 * it is kept in Blobs, per deploy).
 *
 * For the few things a public page needs from the database. Without it the
 * first visit to a fresh server instance asked the database, and on Neon every
 * such question wakes the compute for about six minutes: a crawler passing by
 * now and then used the free CU-hours as surely as a real customer. With it, a
 * visitor or a crawler does not touch the database at all.
 *
 * `seconds` is how long a value is served before it is read again in the
 * background; pass `tags` to expire it sooner (`updateTag` in a Server Action).
 * Where there is no data cache (tests, scripts) or it fails, `load` is called
 * directly, which is what every caller did before.
 *
 * `unstable_cache` rather than `'use cache'`: the directive needs Cache
 * Components switched on for the whole app, which changes how every page renders.
 */
export async function durable<T>(
  key: string[],
  load: () => Promise<T>,
  opts: { seconds: number; tags?: string[] },
): Promise<T> {
  try {
    return await unstable_cache(load, key, { revalidate: opts.seconds, tags: opts.tags })()
  } catch (err) {
    // Next's own control-flow errors (redirects, dynamic bail-outs) carry a digest.
    if (typeof (err as { digest?: unknown } | null)?.digest === 'string') throw err
    return load()
  }
}
