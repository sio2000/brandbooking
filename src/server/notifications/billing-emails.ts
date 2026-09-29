import 'server-only'
import { absoluteUrl } from '@/lib/site'
import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { businesses } from '@/server/db/schema'
import { appUrl } from '@/server/env'
import { translator } from '@/lib/i18n/load'
import { renderEmail } from './layout'
import type { RenderResult } from './booking-emails'
import type { TemplateId } from './outbox'
import { accountLocale, emailLang } from './i18n'

const CONTENT = {
  billing_payment_failed: 'paymentFailed',
  billing_subscription_active: 'active',
  billing_subscription_canceled: 'canceled',
} as const

/** Billing emails go to the owner, in their account language (read at send time). */
export async function renderBillingEmail(
  template: TemplateId,
  businessId: string,
  recipient: string,
): Promise<RenderResult> {
  const [b] = await db()
    .select({ name: businesses.name, locale: businesses.locale })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1)
  if (!b) return { skip: 'business_missing' }
  if (!(template in CONTENT)) return { skip: 'unknown_template' }
  const key = CONTENT[template as keyof typeof CONTENT]
  const locale = await accountLocale(recipient, b.locale)
  const t = await translator(locale, 'email-account')
  const vars = { business: b.name }
  const subject = t(`billing.${key}.subject`, vars)
  const { html, text } = renderEmail({
    preheader: subject,
    brandName: 'Hournook',
    logoUrl: absoluteUrl('/brand/wordmark.png'),
    blocks: [
      { type: 'heading', text: t(`billing.${key}.heading`, vars) },
      { type: 'text', text: t(`billing.${key}.text`, vars) },
      { type: 'button', label: t(`billing.${key}.cta`, vars), url: appUrl('/app/billing') },
    ],
    footer: t('footer'),
    ...emailLang(locale),
  })
  return { message: { to: recipient, subject, html, text } }
}
