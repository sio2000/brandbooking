import 'server-only'
import { renderEmail } from './layout'
import { emailProvider, type EmailMessage } from './providers'
import { logger } from '@/server/observability/logger'

/**
 * Account emails carry single-use secrets (verification, password reset,
 * invitation links), so they are sent immediately instead of via the outbox:
 * the raw token is never persisted anywhere. If sending fails the user can
 * simply request a new link.
 */

const BRAND = 'Hournook'

async function deliver(message: EmailMessage): Promise<boolean> {
  try {
    await emailProvider().send(message)
    return true
  } catch (err) {
    logger.error('email.account.failed', { subject: message.subject, err })
    return false
  }
}

export function sendVerificationEmail(to: string, name: string, url: string) {
  const { html, text } = renderEmail({
    preheader: 'Confirm your email address to finish setting up Hournook.',
    brandName: BRAND,
    blocks: [
      { type: 'heading', text: `Welcome, ${name.split(' ')[0]}` },
      { type: 'text', text: 'Confirm your email address so we can send you booking notifications and keep your account secure.' },
      { type: 'button', label: 'Confirm email address', url },
      { type: 'text', muted: true, text: 'This link expires in 24 hours. If you did not create a Hournook account, you can ignore this email.' },
    ],
    footer: 'Hournook — online booking for small businesses.',
  })
  return deliver({ to, subject: 'Confirm your email address', html, text })
}

export function sendPasswordResetEmail(to: string, url: string) {
  const { html, text } = renderEmail({
    preheader: 'Reset your Hournook password.',
    brandName: BRAND,
    blocks: [
      { type: 'heading', text: 'Reset your password' },
      { type: 'text', text: 'We received a request to reset the password for your account. Use the button below to choose a new one.' },
      { type: 'button', label: 'Choose a new password', url },
      { type: 'text', muted: true, text: 'This link expires in 1 hour and can be used once. If you did not ask for this, you can safely ignore this email — your password will not change.' },
    ],
    footer: 'Hournook — online booking for small businesses.',
  })
  return deliver({ to, subject: 'Reset your Hournook password', html, text })
}

export function sendInvitationEmail(to: string, businessName: string, inviterName: string, role: string, url: string) {
  const { html, text } = renderEmail({
    preheader: `${inviterName} invited you to join ${businessName} on Hournook.`,
    brandName: BRAND,
    blocks: [
      { type: 'heading', text: `Join ${businessName}` },
      { type: 'text', text: `${inviterName} invited you to join ${businessName} on Hournook as ${role === 'manager' ? 'a manager' : 'a team member'}. You'll be able to see your appointments and manage your availability.` },
      { type: 'button', label: 'Accept invitation', url },
      { type: 'text', muted: true, text: 'This invitation expires in 7 days.' },
    ],
    footer: 'Hournook — online booking for small businesses.',
  })
  return deliver({ to, subject: `You're invited to join ${businessName}`, html, text })
}
