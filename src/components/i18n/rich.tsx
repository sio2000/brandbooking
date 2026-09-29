import { Fragment } from 'react'

type Render = (chunk: React.ReactNode) => React.ReactNode

/**
 * Turns `<tag>…</tag>` markers in an already-translated string into React
 * elements, so a sentence with a link or bold word stays one translatable
 * message: rich(t('terms'), { link: (c) => <Link href="/terms">{c}</Link> }).
 * Works in server and client components. Tags may not nest.
 */
export function rich(message: string, tags: Record<string, Render>): React.ReactNode {
  const out: React.ReactNode[] = []
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g
  let last = 0
  let i = 0
  for (const m of message.matchAll(re)) {
    if (m.index > last) out.push(message.slice(last, m.index))
    const render = tags[m[1]!]
    out.push(<Fragment key={i++}>{render ? render(m[2]) : m[2]}</Fragment>)
    last = m.index + m[0].length
  }
  if (last < message.length) out.push(message.slice(last))
  return out.length === 1 ? out[0] : out
}
