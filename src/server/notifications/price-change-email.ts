import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { businesses } from '@/server/db/schema'
import { appUrl } from '@/server/env'
import { absoluteUrl } from '@/lib/site'
import { formatMoney } from '@/lib/format'
import { DEFAULT_LOCALE, LOCALE_META, isLocale } from '@/lib/i18n/config'
import { translator } from '@/lib/i18n/load'
import { renderEmail } from './layout'
import type { RenderResult } from './booking-emails'

/**
 * 30 days' notice of a plan price change to a business owner (queued by
 * src/server/billing/plan-prices.ts), in the owner's account language.
 */
export async function renderPriceChangeEmail(
  businessId: string,
  recipient: string,
  payload: Record<string, unknown>,
): Promise<RenderResult> {
  const [b] = await db()
    .select({ name: businesses.name, timezone: businesses.timezone })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1)
  if (!b) return { skip: 'business_missing' }
  const oldCents = Number(payload.oldCents)
  const newCents = Number(payload.newCents)
  const currency = typeof payload.currency === 'string' ? payload.currency : ''
  const effectiveAt = new Date(String(payload.effectiveAt))
  if (!Number.isFinite(oldCents) || !Number.isFinite(newCents) || !currency) {
    return { skip: 'invalid_payload' }
  }
  if (Number.isNaN(effectiveAt.getTime())) return { skip: 'invalid_payload' }
  const locale = isLocale(payload.locale) ? payload.locale : DEFAULT_LOCALE
  const tag = LOCALE_META[locale].tag
  const t = await translator(locale, 'email-billing')
  const date = new Intl.DateTimeFormat(tag, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: b.timezone,
  }).format(effectiveAt)
  const oldPrice = formatMoney(oldCents, currency, tag)
  const newPrice = formatMoney(newCents, currency, tag)
  const subject = t('priceChange.subject', { date })
  const { html, text } = renderEmail({
    preheader: t('priceChange.preheader', { date }),
    brandName: 'Hournook',
    logoUrl: absoluteUrl('/brand/wordmark.png'),
    blocks: [
      { type: 'heading', text: t('priceChange.heading') },
      {
        type: 'text',
        text: t('priceChange.intro', { business: b.name, oldPrice, newPrice }),
      },
      {
        type: 'details',
        rows: [
          [t('priceChange.oldLabel'), t('priceChange.perMonth', { price: oldPrice })],
          [t('priceChange.newLabel'), t('priceChange.perMonth', { price: newPrice })],
          [t('priceChange.fromLabel'), date],
        ],
      },
      { type: 'text', text: t('priceChange.when', { date }) },
      { type: 'text', text: t('priceChange.cancel', { date }) },
      { type: 'button', label: t('priceChange.cta'), url: appUrl('/app/billing') },
    ],
    footer: t('priceChange.footer'),
  })
  return { message: { to: recipient, subject, html, text } }
}
