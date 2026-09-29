import { DEFAULT_LOCALE, type Locale } from './config'
import { loaders, type Catalogues, type Namespace } from './registry'
import { createTranslator, type MessageTree, type Translator } from './translator'

/** Missing keys in `tree` are filled from `base` (English), so a partial translation still renders. */
function withFallback(tree: MessageTree | undefined, base: MessageTree): MessageTree {
  if (!tree) return base
  const out: MessageTree = {}
  for (const [k, v] of Object.entries(base)) {
    const own = tree[k]
    if (typeof v === 'string') out[k] = typeof own === 'string' && own !== '' ? own : v
    else out[k] = withFallback(typeof own === 'object' ? own : undefined, v)
  }
  return out
}

const cache = new Map<string, Promise<MessageTree>>()

async function read(locale: Locale, ns: Namespace): Promise<MessageTree | undefined> {
  const load = loaders[locale]?.[ns]
  if (!load) return undefined
  return (await load()).default as MessageTree
}

/** One namespace in one language, complete (English fills any gap). Cached per process. */
export function loadMessages(locale: Locale, ns: Namespace): Promise<MessageTree> {
  const key = `${locale}:${ns}`
  let hit = cache.get(key)
  if (!hit) {
    hit = (async () => {
      const base = (await read(DEFAULT_LOCALE, ns)) ?? {}
      return locale === DEFAULT_LOCALE ? base : withFallback(await read(locale, ns), base)
    })()
    cache.set(key, hit)
  }
  return hit
}

/** Several namespaces at once, keyed by namespace (what the client provider receives). */
export async function loadBundle(
  locale: Locale,
  namespaces: readonly Namespace[],
): Promise<Partial<Record<Namespace, MessageTree>>> {
  const trees = await Promise.all(namespaces.map((ns) => loadMessages(locale, ns)))
  return Object.fromEntries(namespaces.map((ns, i) => [ns, trees[i]]))
}

/** A translator outside React (emails, background jobs): `await translator('el', 'email')`. */
export async function translator<N extends Namespace>(
  locale: Locale,
  ns: N,
): Promise<Translator<Catalogues[N]>> {
  return createTranslator<Catalogues[N]>(locale, await loadMessages(locale, ns))
}
