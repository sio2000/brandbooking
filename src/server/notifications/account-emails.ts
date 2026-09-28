import 'server-only'
import { renderEmail } from './layout'
import { randomUUID } from 'node:crypto'
import { company } from '@/lib/legal'
import { absoluteUrl } from '@/lib/site'
import { EmailSendError, emailProvider, type EmailMessage } from './providers'
import { logger } from '@/server/observability/logger'

/**
 * Account emails carry single-use secrets (verification, password reset,
 * invitation links), so they are sent immediately instead of via the outbox:
 * the raw token is never persisted anywhere. If sending fails the user can
 * simply request a new link.
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

export function sendVerificationEmail(to: string, name: string, url: string) {
  const { html, text } = renderEmail({
    preheader: 'Confirm your email address to finish setting up Hournook.',
    brandName: BRAND,
    logoUrl: LOGO_URL,
    blocks: [
      { type: 'heading', text: `Welcome, ${name.split(' ')[0]}` },
      {
        type: 'text',
        text: 'Confirm your email address so we can send you booking notifications and keep your account secure.',
      },
      { type: 'button', label: 'Confirm email address', url },
      {
        type: 'text',
        muted: true,
        text: 'This link expires in 24 hours. If you did not create a Hournook account, you can ignore this email.',
      },
    ],
    footer: 'Hournook, online booking for small businesses.',
  })
  return deliver({ to, subject: 'Confirm your email address', html, text })
}

export function sendPasswordResetEmail(to: string, url: string) {
  const { html, text } = renderEmail({
    preheader: 'Reset your Hournook password.',
    brandName: BRAND,
    logoUrl: LOGO_URL,
    blocks: [
      { type: 'heading', text: 'Reset your password' },
      {
        type: 'text',
        text: 'We received a request to reset the password for your account. Use the button below to choose a new one.',
      },
      { type: 'button', label: 'Choose a new password', url },
      {
        type: 'text',
        muted: true,
        text: 'This link expires in 1 hour and can be used once. If you did not ask for this, you can safely ignore this email. Your password will not change.',
      },
    ],
    footer: 'Hournook, online booking for small businesses.',
  })
  return deliver({ to, subject: 'Reset your Hournook password', html, text })
}

export function sendInvitationEmail(
  to: string,
  businessName: string,
  inviterName: string,
  role: string,
  url: string,
) {
  const { html, text } = renderEmail({
    preheader: `${inviterName} invited you to join ${businessName} on Hournook.`,
    brandName: BRAND,
    logoUrl: LOGO_URL,
    blocks: [
      { type: 'heading', text: `Join ${businessName}` },
      {
        type: 'text',
        text: `${inviterName} invited you to join ${businessName} on Hournook as ${role === 'manager' ? 'a manager' : 'a team member'}. You'll be able to see your appointments and manage your availability.`,
      },
      { type: 'button', label: 'Accept invitation', url },
      { type: 'text', muted: true, text: 'This invitation expires in 7 days.' },
    ],
    footer: 'Hournook, online booking for small businesses.',
  })
  return deliver({ to, subject: `You're invited to join ${businessName}`, html, text })
}
