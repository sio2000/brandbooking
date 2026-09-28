import 'server-only'
import { absoluteUrl } from '@/lib/site'
import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { businesses } from '@/server/db/schema'
import { appUrl } from '@/server/env'
import { renderEmail } from './layout'
import type { RenderResult } from './booking-emails'
import type { TemplateId } from './outbox'

export async function renderBillingEmail(
  template: TemplateId,
  businessId: string,
  recipient: string,
): Promise<RenderResult> {
  const [b] = await db()
    .select({ name: businesses.name })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1)
  if (!b) return { skip: 'business_missing' }
  const billingUrl = appUrl('/app/billing')
  const content = {
    billing_payment_failed: {
      subject: `Action needed: payment failed for ${b.name}`,
      heading: 'We couldn’t process your payment',
      text: `Your latest Hournook payment for ${b.name} didn’t go through. We’ll retry automatically, but please update your payment method to avoid your booking page being paused.`,
      cta: 'Update payment method',
    },
    billing_subscription_active: {
      subject: `Your Hournook subscription is active`,
      heading: 'Thanks, you’re all set',
      text: `Your subscription for ${b.name} is active. Your booking page will keep accepting bookings without interruption.`,
      cta: 'View billing',
    },
    billing_subscription_canceled: {
      subject: `Your Hournook subscription has ended`,
      heading: 'Your subscription has ended',
      text: `The subscription for ${b.name} has been cancelled. Your data is safe and your dashboard is still available, but your booking page no longer accepts new bookings. You can resubscribe at any time.`,
      cta: 'Resubscribe',
    },
  } as const
  if (!(template in content)) return { skip: 'unknown_template' }
  const c = content[template as keyof typeof content]
  const { html, text } = renderEmail({
    preheader: c.subject,
    brandName: 'Hournook',
    logoUrl: absoluteUrl('/brand/wordmark.png'),
    blocks: [
      { type: 'heading', text: c.heading },
      { type: 'text', text: c.text },
      { type: 'button', label: c.cta, url: billingUrl },
    ],
    footer: 'Hournook, online booking for small businesses.',
  })
  return { message: { to: recipient, subject: c.subject, html, text } }
}
