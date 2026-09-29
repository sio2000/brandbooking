import type { Metadata } from 'next'
import Link from 'next/link'
import { History, Hourglass } from 'lucide-react'
import { requireAdminPage } from '@/server/tenancy/context'
import { getPlanPrice } from '@/server/pricing'
import {
  billedSubscriptionCount,
  listPlanPrices,
  migrationSummary,
  NOTICE_DAYS,
  noticeEndsAt,
  openMigrations,
  stripeDashboardUrl,
} from '@/server/billing/plan-prices'
import { currentPlanPriceRow } from '@/server/billing/plan-price-store'
import { env, isStripeConfigured } from '@/server/env'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Alert, EmptyState } from '@/components/ui/feedback'
import {
  DetailList,
  isFuture,
  Mono,
  PageHeader,
  redactPII,
  TableWrap,
  UtcTime,
} from '@/components/admin/primitives'
import { PriceChange, RetryMigrations } from '@/components/admin/price-change'
import { formatDateLong, formatMoney, formatNumber } from '@/lib/format'

export const metadata: Metadata = { title: 'Pricing' }

const money = (cents: number, currency: string) => formatMoney(cents, currency, 'en-GB')

export default async function AdminPricingPage() {
  await requireAdminPage()
  const stripeReady = isStripeConfigured()
  const [price, stored, history, summary, open, subscribers] = await Promise.all([
    getPlanPrice('en-GB'),
    currentPlanPriceRow(),
    listPlanPrices(50),
    migrationSummary(),
    openMigrations(50),
    billedSubscriptionCount(),
  ])
  const priceId = stored?.stripePriceId ?? env().STRIPE_PRICE_ID ?? null
  const failed = open.filter((m) => m.status === 'failed').length

  return (
    <>
      <PageHeader
        title="Pricing"
        description={`The single monthly plan. A new price applies to new checkouts immediately and to existing subscribers after ${NOTICE_DAYS} days’ notice, as the Terms say.`}
        actions={
          <PriceChange
            currentCents={price.cents}
            currency={price.currency}
            subscribers={subscribers}
            noticeDays={NOTICE_DAYS}
            effectiveText={formatDateLong(noticeEndsAt(), 'UTC', 'en-GB')}
          />
        }
      />

      {!stripeReady && (
        <Alert tone="warning" title="Stripe is not configured" className="mb-6">
          STRIPE_SECRET_KEY is not set, so the price can’t be changed here. The displayed price
          comes from PLAN_PRICE_CENTS.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader title="Current price" />
          <CardBody>
            <DetailList
              items={[
                {
                  label: 'Monthly price',
                  value: (
                    <span className="font-display text-2xl font-semibold">
                      {money(price.cents, price.currency)}
                      <span className="ms-2 text-sm font-normal text-muted-foreground">
                        VAT included
                      </span>
                    </span>
                  ),
                },
                {
                  label: 'Stripe price',
                  value: priceId ? (
                    stripeReady ? (
                      <a
                        href={stripeDashboardUrl(`prices/${priceId}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        <Mono>{priceId}</Mono>
                        <span className="sr-only">(opens Stripe in a new tab)</span>
                      </a>
                    ) : (
                      <Mono>{priceId}</Mono>
                    )
                  ) : (
                    <span className="text-muted-foreground">
                      Provisioned automatically (lookup key hournook_monthly)
                    </span>
                  ),
                },
                {
                  label: 'Source',
                  value: stored ? (
                    <>
                      Set in this panel on <UtcTime value={stored.createdAt} /> UTC
                    </>
                  ) : (
                    'Environment (PLAN_PRICE_CENTS / STRIPE_PRICE_ID)'
                  ),
                },
                {
                  label: 'Billed subscriptions',
                  value: `${formatNumber(subscribers)} active, trialing or past due`,
                },
              ]}
            />
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Pending subscription moves"
            description="Existing subscriptions waiting to move to a new price (business name only)"
            action={failed > 0 ? <RetryMigrations failed={failed} /> : undefined}
          />
          {open.length === 0 ? (
            <EmptyState
              icon={Hourglass}
              title="Nothing pending"
              description="After a price change, subscriptions to move are listed here until they’re done."
              className="py-8"
            />
          ) : (
            <TableWrap>
              <caption className="sr-only">Pending and failed price moves</caption>
              <thead>
                <tr>
                  <th scope="col">Business</th>
                  <th scope="col">New price</th>
                  <th scope="col">Moves on</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {open.map((m) => (
                  <tr key={`${m.planPriceId}:${m.businessId}`}>
                    <th scope="row">
                      <Link
                        href={`/admin/businesses/${m.businessId}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {m.businessName}
                      </Link>
                    </th>
                    <td className="tabular">{money(m.amountCents, m.currency)}</td>
                    <td>
                      <UtcTime value={m.effectiveAt} mode="date" />
                    </td>
                    <td>
                      {m.status === 'failed' ? (
                        <Badge tone="danger">Failed</Badge>
                      ) : m.attempts > 0 ? (
                        <Badge tone="warning">Retrying</Badge>
                      ) : (
                        <Badge tone="info">Scheduled</Badge>
                      )}
                      {m.lastError && (
                        <p className="mt-1 max-w-xs text-xs break-words text-muted-foreground">
                          {redactPII(m.lastError)}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Price history" description="Newest first (UTC)" />
          {history.length === 0 ? (
            <EmptyState
              icon={History}
              title="No price changes yet"
              description={`The price has always been ${money(price.cents, price.currency)} from the environment settings.`}
              className="py-8"
            />
          ) : (
            <TableWrap minWidth="min-w-[48rem]">
              <caption className="sr-only">Price history</caption>
              <thead>
                <tr>
                  <th scope="col">Changed</th>
                  <th scope="col">Price</th>
                  <th scope="col">Stripe price</th>
                  <th scope="col">Existing subscribers from</th>
                  <th scope="col">Moves</th>
                  <th scope="col">By</th>
                </tr>
              </thead>
              <tbody>
                {history.map(({ price: p, createdByEmail }) => {
                  const s = summary.get(p.id)
                  return (
                    <tr key={p.id}>
                      <th scope="row" className="text-muted-foreground">
                        <UtcTime value={p.createdAt} />
                      </th>
                      <td className="tabular whitespace-nowrap">
                        {p.previousAmountCents !== null && (
                          <span className="text-muted-foreground line-through">
                            {money(p.previousAmountCents, p.currency)}
                          </span>
                        )}{' '}
                        <span className="font-medium">{money(p.amountCents, p.currency)}</span>
                      </td>
                      <td>
                        <Mono>{p.stripePriceId}</Mono>
                      </td>
                      <td>
                        <UtcTime value={p.effectiveForExistingAt} mode="date" />
                        {isFuture(p.effectiveForExistingAt) && (
                          <span className="block text-xs text-muted-foreground">
                            Notice period running
                          </span>
                        )}
                      </td>
                      <td className="text-[13px] text-muted-foreground">
                        {s
                          ? [
                              s.done && `${s.done} done`,
                              s.pending && `${s.pending} pending`,
                              s.failed && `${s.failed} failed`,
                              s.skipped && `${s.skipped} skipped`,
                            ]
                              .filter(Boolean)
                              .join(' · ') || '—'
                          : 'None'}
                      </td>
                      <td className="max-w-48 truncate text-muted-foreground">
                        {createdByEmail ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  )
}
