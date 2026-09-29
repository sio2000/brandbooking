import 'server-only'
import { renderEmail } from './layout'
import { randomUUID } from 'node:crypto'
import { company } from '@/lib/legal'
import { absoluteUrl } from '@/lib/site'
import { EmailSendError, emailProvider, type EmailMessage } from './providers'
import { logger } from '@/server/observability/logger'
import type { Locale } from '@/lib/i18n/config'
import { translator } from '@/lib/i18n/load'
import { accountLocale, emailLang } from './i18n'

/**
 * Account emails carry single-use secrets (verification, password reset,
 * invitation links), so they are sent immediately instead of via the outbox:
 * the raw token is never persisted anywhere. If sending fails the user can
 * simply request a new link.
 *
 * Each email is in the recipient's account language (`users.locale`); an
 * invitation to someone without an account uses the inviting business's
 * booking-page language. Callers may pass the language explicitly.
 */

const BRAND = 'Hournook'
/** Hosted on the production site so every mail client can load it. */
const LOGO_URL = absoluteUrl('/brand/wordmark.png')

/** Pauses between attempts when the provider has a temporary problem. */
const RETRY_DELAYS_MS = [400, 1200]

/**
 * Sends right away, retrying twice within the request on temporary failures
 * (network errors, rate limits, 5xx), so a brief provider hiccup never leaves a
 * new user waiting for an email that was silently dropped.
 */
async function deliver(message: EmailMessage): Promise<boolean> {
  const started = Date.now()
  const withHeaders: EmailMessage = {
    ...message,
    replyTo: message.replyTo ?? company.email,
    headers: {
      // A unique id per email stops Gmail from folding repeated "Confirm your
      // email address" messages into one old conversation.
      'X-Entity-Ref-ID': randomUUID(),
      ...message.headers,
    },
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const { id } = await emailProvider().send(withHeaders)
      logger.info('email.account.sent', {
        subject: message.subject,
        id,
        attempts: attempt + 1,
        ms: Date.now() - started,
      })
      return true
    } catch (err) {
      const retryable = !(err instanceof EmailSendError) || err.retryable
      const delay = RETRY_DELAYS_MS[attempt]
      if (!retryable || delay === undefined) {
        logger.error('email.account.failed', {
          subject: message.subject,
          attempts: attempt + 1,
          ms: Date.now() - started,
          err,
        })
        return false
      }
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  url: string,
  locale?: Locale,
) {
  const lang = locale ?? (await accountLocale(to))
  const t = await translator(lang, 'email-account')
  const { html, text } = renderEmail({
    preheader: t('verify.preheader'),
    brandName: BRAND,
    logoUrl: LOGO_URL,
    blocks: [
      { type: 'heading', text: t('verify.heading', { name: name.split(' ')[0] }) },
      { type: 'text', text: t('verify.body') },
      { type: 'button', label: t('verify.cta'), url },
      { type: 'text', muted: true, text: t('verify.expiry') },
    ],
    footer: t('footer'),
    ...emailLang(lang),
  })
  return deliver({ to, subject: t('verify.subject'), html, text })
}

export async function sendPasswordResetEmail(to: string, url: string, locale?: Locale) {
  const lang = locale ?? (await accountLocale(to))
  const t = await translator(lang, 'email-account')
  const { html, text } = renderEmail({
    preheader: t('reset.preheader'),
    brandName: BRAND,
    logoUrl: LOGO_URL,
    blocks: [
      { type: 'heading', text: t('reset.heading') },
      { type: 'text', text: t('reset.body') },
      { type: 'button', label: t('reset.cta'), url },
      { type: 'text', muted: true, text: t('reset.expiry') },
    ],
    footer: t('footer'),
    ...emailLang(lang),
  })
  return deliver({ to, subject: t('reset.subject'), html, text })
}

export async function sendInvitationEmail(
  to: string,
  businessName: string,
  inviterName: string,
  role: string,
  url: string,
  /** The inviting business's language, for invitees without an account yet. */
  businessLocale?: string | null,
) {
  const lang = await accountLocale(to, businessLocale)
  const t = await translator(lang, 'email-account')
  const vars = {
    business: businessName,
    inviter: inviterName,
    role: role === 'manager' ? t('invite.roleManager') : t('invite.roleMember'),
  }
  const { html, text } = renderEmail({
    preheader: t('invite.preheader', vars),
    brandName: BRAND,
    logoUrl: LOGO_URL,
    blocks: [
      { type: 'heading', text: t('invite.heading', vars) },
      { type: 'text', text: t('invite.body', vars) },
      { type: 'button', label: t('invite.cta'), url },
      { type: 'text', muted: true, text: t('invite.expiry') },
    ],
    footer: t('footer'),
    ...emailLang(lang),
  })
  return deliver({ to, subject: t('invite.subject', vars), html, text })
}
