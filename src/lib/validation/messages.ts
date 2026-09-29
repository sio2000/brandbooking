import type { z } from 'zod'
import en from '@/lib/i18n/messages/en/validation.json'
import type { Keys, MessageTree, Vars } from '@/lib/i18n/translator'

/**
 * Validation messages.
 *
 * Schemas keep their English text as the Zod message (so logs, tests and any
 * code reading `issue.message` see exactly what they always did), but the text
 * comes from the `validation` catalogue: `vmsg('email.invalid')`. When errors
 * are sent to the browser, `localizeMessage` maps the English text back to its
 * key (placeholders included: "Use at least 10 characters." → text.tooShort
 * with { min: 10 }) and translates it into the request's language. Text that
 * isn't in the catalogue is shown as is.
 */

export type ValidationKey = Keys<typeof en>

function lookup(key: string): string {
  let node: string | MessageTree | undefined = en as MessageTree
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined
  if (typeof node !== 'string') throw new Error(`Unknown validation message: ${key}`)
  return node
}

/** English text of a validation message, for use in Zod schemas. */
export function vmsg(key: ValidationKey, vars: Record<string, string | number> = {}): string {
  return lookup(key).replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  )
}

type Entry = { key: string; re: RegExp; names: string[] }
let exact: Map<string, string> | null = null
let templated: Entry[] = []

function index() {
  if (exact) return exact
  exact = new Map()
  const walk = (tree: MessageTree, prefix: string) => {
    for (const [k, v] of Object.entries(tree)) {
      const key = prefix + k
      if (typeof v !== 'string') walk(v, `${key}.`)
      // Generic messages are only chosen by issue code, never matched by text.
      else if (key.startsWith('generic.')) continue
      else if (!/\{\w+\}/.test(v)) exact!.set(v, key)
      else {
        const names = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)
        const source = v
          .split(/\{\w+\}/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('(.+?)')
        templated.push({ key, re: new RegExp(`^${source}$`), names })
      }
    }
  }
  templated = []
  walk(en as MessageTree, '')
  return exact
}

/** Catalogue key and placeholder values for an English validation message, if it is one. */
export function matchMessage(message: string): { key: string; vars: Vars } | null {
  const key = index().get(message)
  if (key) return { key, vars: {} }
  for (const e of templated) {
    const m = e.re.exec(message)
    if (!m) continue
    const vars: Vars = {}
    e.names.forEach((name, i) => {
      const raw = m[i + 1]!
      vars[name] = /^\d+$/.test(raw) ? Number(raw) : raw
    })
    return { key: e.key, vars }
  }
  return null
}

/** Something that translates `validation` keys (a Translator for that namespace). */
export type ValidationT = ((key: string, vars?: Vars) => string) & { locale: string }

/** The message in the translator's language; unknown text is returned unchanged. */
export function localizeMessage(message: string, t?: ValidationT): string {
  if (!t || t.locale === 'en') return message
  const hit = matchMessage(message)
  return hit ? t(hit.key, hit.vars) : message
}

/**
 * A Zod issue in the translator's language. English keeps Zod's own wording;
 * other languages get a generic message for Zod's built-in (untranslated)
 * defaults, chosen by issue code.
 */
export function localizeIssue(issue: z.core.$ZodIssue, t?: ValidationT): string {
  if (!t || t.locale === 'en') return issue.message
  const hit = matchMessage(issue.message)
  if (hit) return t(hit.key, hit.vars)
  const i = issue as z.core.$ZodIssue & {
    origin?: string
    minimum?: number | bigint
    maximum?: number | bigint
    format?: string
  }
  const n = (v: number | bigint | undefined) => (v === undefined ? undefined : Number(v))
  switch (issue.code) {
    case 'invalid_type':
      return /received (undefined|null)/.test(issue.message)
        ? t('generic.required')
        : t('generic.invalid')
    case 'too_small':
      if (i.origin === 'string')
        return n(i.minimum) === 1
          ? t('generic.required')
          : t('text.tooShort', { min: n(i.minimum) })
      if (i.origin === 'array' || i.origin === 'set')
        return t('generic.tooFew', { min: n(i.minimum) })
      return t('generic.numberMin', { min: n(i.minimum) })
    case 'too_big':
      if (i.origin === 'string') return t('text.tooLong', { max: n(i.maximum) })
      if (i.origin === 'array' || i.origin === 'set')
        return t('generic.tooMany', { max: n(i.maximum) })
      return t('generic.numberMax', { max: n(i.maximum) })
    case 'invalid_format':
      if (i.format === 'email') return t('email.invalid')
      if (i.format === 'url') return t('url.invalid')
      if (i.format === 'datetime' || i.format === 'date') return t('date.invalid')
      return t('generic.invalid')
    case 'invalid_value':
      return t('generic.chooseOption')
    case 'custom':
      return issue.message
    default:
      return t('generic.invalid')
  }
}

/** Translates the values of a `{ field: message }` map (AppError fields). */
export function localizeFields(
  fields: Record<string, string> | undefined,
  t?: ValidationT,
): Record<string, string> | undefined {
  if (!fields || !t || t.locale === 'en') return fields
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, localizeMessage(v, t)]))
}
