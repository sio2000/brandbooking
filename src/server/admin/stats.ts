import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { getPlanPrice } from '@/server/pricing'

/**
 * Platform statistics for the admin panel. Aggregates only: no query here
 * returns a customer's (or an appointment's) personal data.
 */

const n = (v: unknown) => Number(v ?? 0)

export async function overviewStats() {
  const [row] = await db().execute<Record<string, number>>(sql`
    SELECT
      (SELECT count(*) FROM users)::int AS users,
      (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days')::int AS users_7d,
      (SELECT count(*) FROM users WHERE created_at > now() - interval '30 days')::int AS users_30d,
      (SELECT count(*) FROM users WHERE banned_at IS NOT NULL)::int AS banned,
      (SELECT count(*) FROM users WHERE email_verified_at IS NULL)::int AS unverified,
      (SELECT count(*) FROM businesses WHERE deleted_at IS NULL)::int AS businesses,
      (SELECT count(*) FROM businesses WHERE deleted_at IS NULL AND created_at > now() - interval '7 days')::int AS businesses_7d,
      (SELECT count(*) FROM businesses WHERE deleted_at IS NULL AND created_at > now() - interval '30 days')::int AS businesses_30d,
      (SELECT count(*) FROM businesses WHERE deleted_at IS NULL AND publish_status = 'published')::int AS published,
      (SELECT count(*) FROM businesses WHERE deleted_at IS NULL AND status = 'suspended')::int AS suspended,
      (SELECT count(*) FROM businesses b LEFT JOIN subscriptions s ON s.business_id = b.id
        WHERE b.deleted_at IS NULL AND (s.status = 'trialing'
          OR (coalesce(s.status, '') NOT IN ('active', 'past_due', 'unpaid', 'trialing') AND b.trial_ends_at > now())))::int AS trialing,
      (SELECT count(*) FROM subscriptions WHERE status = 'active')::int AS paying,
      (SELECT count(*) FROM subscriptions WHERE status IN ('past_due', 'unpaid'))::int AS past_due,
      (SELECT count(*) FROM subscriptions WHERE status = 'canceled')::int AS canceled,
      (SELECT count(*) FROM appointments)::int AS bookings_total,
      (SELECT count(*) FROM appointments WHERE created_at > now() - interval '30 days')::int AS bookings_30d,
      (SELECT count(*) FROM appointments WHERE created_at > now() - interval '7 days')::int AS bookings_7d,
      (SELECT count(*) FROM customers)::int AS customers
  `)
  const r = row ?? {}
  const [mrr, conversion, churn] = await Promise.all([mrrStats(), trialConversion(), churnStats()])
  return {
    users: n(r.users),
    users7d: n(r.users_7d),
    users30d: n(r.users_30d),
    banned: n(r.banned),
    unverified: n(r.unverified),
    businesses: n(r.businesses),
    businesses7d: n(r.businesses_7d),
    businesses30d: n(r.businesses_30d),
    published: n(r.published),
    suspended: n(r.suspended),
    trialing: n(r.trialing),
    paying: n(r.paying),
    pastDue: n(r.past_due),
    canceled: n(r.canceled),
    bookingsTotal: n(r.bookings_total),
    bookings30d: n(r.bookings_30d),
    bookings7d: n(r.bookings_7d),
    customers: n(r.customers),
    mrr,
    conversion,
    churn,
  }
}

/**
 * MRR from what each paying (active or past-due) subscription actually costs:
 * its Stripe price amount as last synced, else the plan price it is on.
 * Subscriptions with no known amount yet are counted, not guessed.
 */
export async function mrrStats() {
  const rows = await db().execute<{ currency: string | null; cents: string; subs: number }>(sql`
    SELECT coalesce(s.price_currency, pp.currency) AS currency,
      coalesce(sum(coalesce(s.unit_amount_cents, pp.amount_cents)), 0)::bigint AS cents,
      count(*)::int AS subs
    FROM subscriptions s
    LEFT JOIN plan_prices pp ON pp.stripe_price_id = s.stripe_price_id
    WHERE s.status IN ('active', 'past_due')
    GROUP BY 1`)
  const plan = await getPlanPrice()
  const priced = rows.filter((r) => r.currency)
  const unpriced = rows.filter((r) => !r.currency).reduce((a, r) => a + n(r.subs), 0)
  const main = priced.find((r) => r.currency === plan.currency) ?? priced[0]
  const mrrCents = n(main?.cents)
  return {
    currency: main?.currency ?? plan.currency,
    mrrCents,
    arrCents: mrrCents * 12,
    subscriptions: priced.reduce((a, r) => a + n(r.subs), 0),
    unpriced,
    other: priced
      .filter((r) => r !== main)
      .map((r) => ({ currency: r.currency!, mrrCents: n(r.cents) })),
  }
}

/** Businesses whose free trial ended in the last 90 days, and how many subscribed. */
export async function trialConversion() {
  const [row] = await db().execute<{ ended: number; converted: number }>(sql`
    SELECT count(*)::int AS ended,
      count(*) FILTER (WHERE s.stripe_subscription_id IS NOT NULL
        AND coalesce(s.status, '') NOT IN ('incomplete', 'incomplete_expired', ''))::int AS converted
    FROM businesses b
    LEFT JOIN subscriptions s ON s.business_id = b.id
    WHERE b.trial_ends_at <= now() AND b.trial_ends_at > now() - interval '90 days'`)
  const ended = n(row?.ended)
  const converted = n(row?.converted)
  return { ended, converted, rate: ended ? converted / ended : null }
}

/**
 * Subscriptions canceled in the last 30 days, over subscriptions that were
 * running 30 days ago (started before then and not canceled before then).
 */
export async function churnStats() {
  const [row] = await db().execute<{ canceled: number; base: number }>(sql`
    SELECT
      count(*) FILTER (WHERE status = 'canceled' AND canceled_at > now() - interval '30 days')::int AS canceled,
      count(*) FILTER (WHERE stripe_subscription_id IS NOT NULL
        AND created_at <= now() - interval '30 days'
        AND coalesce(status, '') NOT IN ('incomplete', 'incomplete_expired', '')
        AND (canceled_at IS NULL OR canceled_at > now() - interval '30 days'))::int AS base
    FROM subscriptions`)
  const canceled = n(row?.canceled)
  const base = n(row?.base)
  return { canceled, base, rate: base ? canceled / base : null }
}

export type StatsRange = 30 | 90 | 365

export type SeriesPoint = {
  bucket: string
  signups: number
  businesses: number
  bookings: number
  mrrCents: number
}

/** Daily (30/90 days) or weekly (365 days) series, UTC buckets. */
export async function timeSeries(range: StatsRange) {
  const unit = range > 90 ? 'week' : 'day'
  const step = sql.raw(`interval '1 ${unit}'`)
  const u = sql.raw(`'${unit}'`)
  const rows = await db().execute<{
    bucket: string
    signups: number
    businesses: number
    bookings: number
    mrr: string
  }>(sql`
    WITH buckets AS (
      SELECT generate_series(
        date_trunc(${u}, now() - make_interval(days => ${range - 1}::int), 'UTC'),
        date_trunc(${u}, now(), 'UTC'),
        ${step}) AS b
    ),
    lo AS (SELECT min(b) AS b FROM buckets),
    su AS (SELECT date_trunc(${u}, created_at, 'UTC') AS b, count(*) AS n FROM users
      WHERE created_at >= (SELECT b FROM lo) GROUP BY 1),
    bz AS (SELECT date_trunc(${u}, created_at, 'UTC') AS b, count(*) AS n FROM businesses
      WHERE created_at >= (SELECT b FROM lo) GROUP BY 1),
    ap AS (SELECT date_trunc(${u}, created_at, 'UTC') AS b, count(*) AS n FROM appointments
      WHERE created_at >= (SELECT b FROM lo) GROUP BY 1),
    ev AS (
      SELECT be.business_id, be.stripe_created_at AS at, be.summary->>'status' AS status,
        coalesce((be.summary->>'amount')::int, s.unit_amount_cents, pp.amount_cents, 0) AS cents,
        lead(be.stripe_created_at) OVER (PARTITION BY be.business_id ORDER BY be.stripe_created_at) AS until
      FROM billing_events be
      LEFT JOIN subscriptions s ON s.business_id = be.business_id
      LEFT JOIN plan_prices pp ON pp.stripe_price_id = coalesce(be.summary->>'priceId', s.stripe_price_id)
      WHERE be.business_id IS NOT NULL AND be.status = 'processed'
        AND be.type LIKE 'customer.subscription.%' AND be.summary->>'status' IS NOT NULL
    ),
    mrr AS (
      SELECT bk.b, coalesce(sum(ev.cents), 0) AS cents
      FROM buckets bk
      LEFT JOIN ev ON ev.status IN ('active', 'past_due')
        AND ev.at < bk.b + ${step} AND (ev.until IS NULL OR ev.until >= bk.b + ${step})
      GROUP BY bk.b
    )
    SELECT to_char(bk.b AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS bucket,
      coalesce(su.n, 0)::int AS signups, coalesce(bz.n, 0)::int AS businesses,
      coalesce(ap.n, 0)::int AS bookings, coalesce(mrr.cents, 0)::bigint AS mrr
    FROM buckets bk
    LEFT JOIN su ON su.b = bk.b
    LEFT JOIN bz ON bz.b = bk.b
    LEFT JOIN ap ON ap.b = bk.b
    LEFT JOIN mrr ON mrr.b = bk.b
    ORDER BY bk.b`)
  return {
    unit: unit as 'day' | 'week',
    points: rows.map((r): SeriesPoint => ({
      bucket: r.bucket,
      signups: n(r.signups),
      businesses: n(r.businesses),
      bookings: n(r.bookings),
      mrrCents: n(r.mrr),
    })),
  }
}

type Count = { key: string; n: number }

async function counts(query: ReturnType<typeof sql>): Promise<Count[]> {
  const rows = await db().execute<{ key: string | null; n: number }>(query)
  return rows.map((r) => ({ key: r.key ?? '', n: n(r.n) }))
}

/** Breakdowns: bookings by source/status, emails, top businesses, languages, places. */
export async function breakdowns() {
  const [sources, statuses, emails, top, userLocales, businessLocales, countries, timezones] =
    await Promise.all([
      counts(sql`SELECT source::text AS key, count(*)::int AS n FROM appointments
      WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC`),
      counts(sql`SELECT status::text AS key, count(*)::int AS n FROM appointments
      WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC`),
      counts(sql`SELECT status::text AS key, count(*)::int AS n FROM notifications
      WHERE created_at > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC`),
      db().execute<{ id: string; name: string; n: number }>(sql`
      SELECT b.id, b.name, count(*)::int AS n FROM appointments a
      JOIN businesses b ON b.id = a.business_id
      WHERE a.created_at > now() - interval '30 days' AND b.deleted_at IS NULL
      GROUP BY b.id, b.name ORDER BY n DESC, b.name LIMIT 10`),
      counts(sql`SELECT locale AS key, count(*)::int AS n FROM users GROUP BY 1 ORDER BY 2 DESC`),
      counts(sql`SELECT locale AS key, count(*)::int AS n FROM businesses
      WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC`),
      counts(sql`SELECT upper(nullif(trim(country), '')) AS key, count(*)::int AS n FROM businesses
      WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 15`),
      counts(sql`SELECT timezone AS key, count(*)::int AS n FROM businesses
      WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 15`),
    ])
  const byStatus = Object.fromEntries(emails.map((e) => [e.key, e.n]))
  return {
    sources,
    statuses,
    emails: {
      sent: byStatus.sent ?? 0,
      failed: byStatus.failed ?? 0,
      pending: (byStatus.pending ?? 0) + (byStatus.sending ?? 0),
      cancelled: byStatus.cancelled ?? 0,
    },
    topBusinesses: top.map((r) => ({ id: r.id, name: r.name, bookings: n(r.n) })),
    userLocales,
    businessLocales,
    countries,
    timezones,
  }
}
