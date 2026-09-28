import 'server-only'

/**
 * Structured JSON logger. Secrets and personal data are redacted by key name
 * before anything is written, so call sites cannot accidentally leak them.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const REDACT_KEYS =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|stripe[-_]?key|signature|card|cvc|iban|session|hash|smtp_url|database_url|credential/i
const PII_KEYS = /^(email|phone|first_?name|last_?name|name|address|notes?|message|recipient)$/i

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]'
  if (value === null || value === undefined) return value
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack?.split('\n').slice(0, 8).join('\n'),
    }
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEYS.test(k)) out[k] = '[redacted]'
      else if (PII_KEYS.test(k) && typeof v === 'string') out[k] = maskPii(v)
      else out[k] = redact(v, depth + 1)
    }
    return out
  }
  if (typeof value === 'string' && value.length > 2000) return value.slice(0, 2000) + '…'
  return value
}

function maskPii(v: string): string {
  const at = v.indexOf('@')
  if (at > 0) return `${v[0]}***${v.slice(at)}`
  return v.length <= 2 ? '**' : `${v[0]}***`
}

function threshold(): number {
  const lvl =
    (process.env.LOG_LEVEL as Level | undefined) ??
    (process.env.NODE_ENV === 'test' ? 'warn' : 'info')
  return ORDER[lvl] ?? ORDER.info
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return
  const line = JSON.stringify({
    ...(redact(fields ?? {}) as object),
    ts: new Date().toISOString(),
    level,
    msg,
  })
  if (level === 'error' || level === 'warn') console.error(line)
  // eslint-disable-next-line no-console
  else console.log(line)
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
}
