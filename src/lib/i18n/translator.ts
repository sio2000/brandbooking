import { DEFAULT_LOCALE, LOCALE_META, type Locale } from './config'
import { formatMessage } from './format'

export type MessageTree = { [key: string]: string | MessageTree }
export type Vars = Record<string, string | number | null | undefined>

/** Dotted paths of the string leaves of a message tree: 'hero.title' | … */
export type Keys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Keys<T[K]>}`
}[keyof T & string]

function lookup(tree: MessageTree | undefined, key: string): string | undefined {
  let node: string | MessageTree | undefined = tree
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * A translator for one namespace. Missing translations fall back to English,
 * then to the key itself (visible, so gaps are easy to spot and tests catch them).
 */
export function createTranslator<T = MessageTree>(
  locale: Locale,
  messages: MessageTree | undefined,
  fallback?: MessageTree,
) {
  const tag = LOCALE_META[locale].tag
  const t = (key: Keys<T> | (string & {}), vars?: Vars): string => {
    const template =
      lookup(messages, key) ?? (locale !== DEFAULT_LOCALE ? lookup(fallback, key) : undefined)
    return template === undefined ? key : formatMessage(template, vars, tag)
  }
  /** Raw lookup: whether a key exists (for optional copy). */
  t.has = (key: string) =>
    lookup(messages, key) !== undefined || lookup(fallback, key) !== undefined
  t.locale = locale
  return t
}

export type Translator<T = MessageTree> = ReturnType<typeof createTranslator<T>>
