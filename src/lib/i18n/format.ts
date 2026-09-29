/**
 * Formats a message: `{name}` placeholders, plus ICU-style plurals and selects
 * (`{count, plural, one {# booking} other {# bookings}}`,
 * `{role, select, owner {Owner} other {Member}}`). Plural categories come from
 * Intl.PluralRules, so languages with several forms (ar, ru, pl) work.
 */
type Vars = Record<string, string | number | null | undefined>

const pluralRules = new Map<string, Intl.PluralRules>()
function plural(tag: string, n: number) {
  let r = pluralRules.get(tag)
  if (!r) pluralRules.set(tag, (r = new Intl.PluralRules(tag)))
  return r.select(n)
}

/** Finds the matching closing brace for the `{` at `start`. */
function closing(s: string, start: number) {
  let depth = 0
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth === 0) return i
  }
  return -1
}

function parseOptions(body: string): Map<string, string> {
  const out = new Map<string, string>()
  let i = 0
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i]!)) i++
    const keyStart = i
    while (i < body.length && !/[\s{]/.test(body[i]!)) i++
    const key = body.slice(keyStart, i)
    while (i < body.length && /\s/.test(body[i]!)) i++
    if (body[i] !== '{' || !key) break
    const end = closing(body, i)
    if (end < 0) break
    out.set(key, body.slice(i + 1, end))
    i = end + 1
  }
  return out
}

export function formatMessage(template: string, vars: Vars = {}, tag = 'en-GB'): string {
  let out = ''
  let i = 0
  while (i < template.length) {
    const open = template.indexOf('{', i)
    if (open < 0) {
      out += template.slice(i)
      break
    }
    out += template.slice(i, open)
    const end = closing(template, open)
    if (end < 0) {
      out += template.slice(open)
      break
    }
    const inner = template.slice(open + 1, end)
    const m = inner.match(/^\s*(\w+)\s*(?:,\s*(plural|select)\s*,([\s\S]*))?$/)
    if (!m) {
      out += template.slice(open, end + 1)
    } else if (!m[2]) {
      const v = vars[m[1]!]
      out += v === undefined || v === null ? `{${m[1]}}` : String(v)
    } else {
      const value = vars[m[1]!]
      const options = parseOptions(m[3] ?? '')
      let chosen: string | undefined
      if (m[2] === 'plural') {
        const n = Number(value ?? 0)
        chosen = options.get(`=${n}`) ?? options.get(plural(tag, n)) ?? options.get('other')
        if (chosen !== undefined)
          chosen = formatMessage(chosen, vars, tag).replace(
            /#/g,
            new Intl.NumberFormat(tag).format(n),
          )
      } else {
        chosen = options.get(String(value)) ?? options.get('other')
        if (chosen !== undefined) chosen = formatMessage(chosen, vars, tag)
      }
      out += chosen ?? ''
    }
    i = end + 1
  }
  return out
}
