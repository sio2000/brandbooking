import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect } from '@playwright/test'
import { E2E_MAIL_DIR } from './env'

/** An email the app sent through (fake) Resend. */
export type Mail = {
  id: string
  at: string
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  reply_to?: string
  headers?: Record<string, string>
}

export function allMail(): Mail[] {
  const dir = path.resolve(E2E_MAIL_DIR)
  let files: string[] = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  return files.sort().map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Mail)
}

export function mailTo(to: string, subject?: RegExp) {
  return allMail().filter((m) => m.to.includes(to) && (!subject || subject.test(m.subject)))
}

/** Waits until an email to `to` (optionally matching `subject`) has been sent. */
export async function waitForMail(
  to: string,
  subject?: RegExp,
  opts: { timeout?: number; count?: number } = {},
): Promise<Mail> {
  const count = opts.count ?? 1
  await expect
    .poll(() => mailTo(to, subject).length, {
      timeout: opts.timeout ?? 15_000,
      message: `email to ${to} ${subject ?? ''}`,
    })
    .toBeGreaterThanOrEqual(count)
  return mailTo(to, subject)[count - 1]!
}

/** First absolute link in the email's text containing `pathPart`. */
export function linkIn(mail: Mail, pathPart: string): string {
  const url = mail.text.match(/https?:\/\/[^\s)>\]]+/g)?.find((u) => u.includes(pathPart))
  if (!url) throw new Error(`No link containing ${pathPart} in "${mail.subject}"`)
  return url
}

/** No template placeholders or missing values leaked into the email. */
export function expectComplete(mail: Mail) {
  for (const part of [mail.subject, mail.text, mail.html]) {
    expect(part).not.toMatch(/\bundefined\b|\bnull\b|NaN|\{\{|\[object Object\]/)
  }
}
