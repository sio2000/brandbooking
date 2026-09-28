import 'server-only'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '@/server/env'
import { logger } from '@/server/observability/logger'

/**
 * Email provider abstraction. Business logic only ever calls `emailProvider().send()`;
 * switching provider is a configuration change (EMAIL_PROVIDER).
 */

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
  /** Display name shown in the From header; the address is always EMAIL_FROM's. */
  fromName?: string
  replyTo?: string
  headers?: Record<string, string>
}

export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'EmailSendError'
  }
}

export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage): Promise<{ id: string }>
}

/** Build a From header that never impersonates a customer's domain. */
export function fromHeader(fromName?: string): string {
  const configured = env().EMAIL_FROM
  const match = configured.match(/<([^>]+)>/)
  const address = match ? match[1]! : configured.trim()
  if (!fromName) return configured
  const safe = fromName.replace(/["\r\n<>]/g, '').slice(0, 70)
  return `"${safe}" <${address}>`
}

class LogProvider implements EmailProvider {
  readonly name = 'log'
  async send(m: EmailMessage) {
    const id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    if (process.env.NODE_ENV === 'production') {
      // Trial deployments only (ALLOW_LOG_EMAIL_IN_PRODUCTION): the message,
      // including any links, goes to the server log so it can be read there.
      logger.warn('email.logged', { to: m.to, subject: m.subject, text: m.text })
      return { id }
    }
    // Development preview: open .data/mail/*.html in a browser.
    try {
      const dir = path.join(process.cwd(), '.data/mail')
      await mkdir(dir, { recursive: true })
      const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${id}.html`)
      const meta = `<!-- to: ${m.to}\n subject: ${m.subject} -->\n`
      await writeFile(file, meta + m.html)
      logger.info('email.logged', { to: m.to, subject: m.subject, preview: file })
    } catch {
      logger.info('email.logged', { to: m.to, subject: m.subject })
    }
    return { id }
  }
}

type Stored = EmailMessage & { id: string; from: string; at: Date }
const mem = globalThis as unknown as {
  __hnMail?: { sent: Stored[]; failNext: number; failRetryable: boolean }
}
export function memoryMailbox() {
  mem.__hnMail ??= { sent: [], failNext: 0, failRetryable: true }
  return mem.__hnMail
}

class MemoryProvider implements EmailProvider {
  readonly name = 'memory'
  async send(m: EmailMessage) {
    const box = memoryMailbox()
    if (box.failNext > 0) {
      box.failNext--
      throw new EmailSendError('Simulated provider failure', box.failRetryable)
    }
    const id = `mem-${box.sent.length + 1}`
    box.sent.push({ ...m, id, from: fromHeader(m.fromName), at: new Date() })
    return { id }
  }
}

class SmtpProvider implements EmailProvider {
  readonly name = 'smtp'
  private transport: import('nodemailer').Transporter | undefined
  async send(m: EmailMessage) {
    const nodemailer = await import('nodemailer')
    this.transport ??= nodemailer.createTransport(env().SMTP_URL!)
    try {
      const info = await this.transport.sendMail({
        from: fromHeader(m.fromName),
        to: m.to,
        replyTo: m.replyTo,
        subject: m.subject,
        html: m.html,
        text: m.text,
        headers: m.headers,
      })
      return { id: String(info.messageId) }
    } catch (err) {
      const code = (err as { responseCode?: number }).responseCode
      // 5xx SMTP replies are permanent (bad address, rejected); others retry.
      throw new EmailSendError(
        err instanceof Error ? err.message : 'SMTP error',
        !(code && code >= 500 && code < 600),
      )
    }
  }
}

class ResendProvider implements EmailProvider {
  readonly name = 'resend'
  async send(m: EmailMessage) {
    let res: Response
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env().RESEND_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: fromHeader(m.fromName),
          to: [m.to],
          subject: m.subject,
          html: m.html,
          text: m.text,
          reply_to: m.replyTo,
          headers: m.headers,
        }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (err) {
      throw new EmailSendError(err instanceof Error ? err.message : 'Network error', true)
    }
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500
      throw new EmailSendError(`Resend responded ${res.status}`, retryable)
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string }
    return { id: body.id ?? 'resend' }
  }
}

let provider: EmailProvider | undefined
export function emailProvider(): EmailProvider {
  if (provider) return provider
  switch (env().EMAIL_PROVIDER) {
    case 'smtp':
      provider = new SmtpProvider()
      break
    case 'resend':
      provider = new ResendProvider()
      break
    case 'memory':
      provider = new MemoryProvider()
      break
    default:
      provider = new LogProvider()
  }
  return provider
}
