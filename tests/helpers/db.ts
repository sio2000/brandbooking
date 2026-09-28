import { sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { memoryMailbox } from '@/server/notifications/providers'

/** Wipe all application data (fast TRUNCATE) between test files. */
export async function resetDatabase() {
  await db().execute(sql`
    TRUNCATE users, sessions, auth_tokens, businesses, staff, business_members, invitations,
      service_categories, services, staff_services, weekly_hours, special_hours, closures, time_blocks,
      booking_rules, customers, appointments, appointment_events, notifications, inbox_items,
      subscriptions, billing_events, audit_logs, uploaded_assets, feature_flags, platform_settings,
      rate_limits, booking_page_events RESTART IDENTITY CASCADE`)
  const box = memoryMailbox()
  box.sent.length = 0
  box.failNext = 0
}

export async function clearRateLimits() {
  await db().execute(sql`TRUNCATE rate_limits`)
}
