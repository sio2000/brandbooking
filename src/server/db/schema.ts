/**
 * Typed Drizzle mirror of the SQL migrations in ./migrations.
 *
 * The SQL files are the source of truth for constraints (exclusion constraints,
 * composite tenant foreign keys, checks). This file only describes columns so
 * queries are type-safe. `tests/integration/schema-drift.test.ts` fails if the
 * two ever disagree.
 */
import {
  bigint,
  boolean,
  char,
  customType,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

const citext = customType<{ data: string }>({ dataType: () => 'citext' })
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const memberRole = pgEnum('member_role', ['owner', 'manager', 'staff'])
export const businessStatus = pgEnum('business_status', ['active', 'suspended'])
export const publishStatus = pgEnum('publish_status', ['draft', 'published', 'paused'])
export const appointmentStatus = pgEnum('appointment_status', [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
])
export const appointmentSource = pgEnum('appointment_source', [
  'booking_page',
  'widget',
  'qr',
  'manual',
  'campaign',
  'social',
  'api',
])
export const actorType = pgEnum('actor_type', ['user', 'customer', 'system', 'admin', 'stripe'])
export const authTokenPurpose = pgEnum('auth_token_purpose', [
  'email_verification',
  'password_reset',
])
export const notificationStatus = pgEnum('notification_status', [
  'pending',
  'sending',
  'sent',
  'failed',
  'cancelled',
])
export const staffSelectionMode = pgEnum('staff_selection_mode', ['optional', 'required', 'hidden'])
export const fieldRequirement = pgEnum('field_requirement', ['required', 'optional', 'hidden'])
export const assetKind = pgEnum('asset_kind', ['logo', 'cover', 'avatar'])
export const funnelStep = pgEnum('funnel_step', [
  'view',
  'service',
  'staff',
  'date',
  'time',
  'details',
  'confirmed',
])

export type MemberRole = (typeof memberRole.enumValues)[number]
export type AppointmentStatus = (typeof appointmentStatus.enumValues)[number]
export type AppointmentSource = (typeof appointmentSource.enumValues)[number]
export type ActorType = (typeof actorType.enumValues)[number]
export type PublishStatus = (typeof publishStatus.enumValues)[number]
export type FunnelStep = (typeof funnelStep.enumValues)[number]
export type AssetKind = (typeof assetKind.enumValues)[number]

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull(),
  emailVerifiedAt: tstz('email_verified_at'),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  locale: text('locale').notNull().default('en'),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: tstz('locked_until'),
  lastLoginAt: tstz('last_login_at'),
  // Set at sign-up: acceptance of the Terms of Service (incl. the DPA).
  termsAcceptedAt: tstz('terms_accepted_at'),
  termsVersion: text('terms_version'),
  // Set by a platform admin: the account cannot sign in (0004_admin).
  bannedAt: tstz('banned_at'),
  bannedReason: text('banned_reason'),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  expiresAt: tstz('expires_at').notNull(),
  lastSeenAt: tstz('last_seen_at').notNull().defaultNow(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: tstz('created_at').notNull().defaultNow(),
})

export const authTokens = pgTable('auth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  purpose: authTokenPurpose('purpose').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: tstz('expires_at').notNull(),
  usedAt: tstz('used_at'),
  createdAt: tstz('created_at').notNull().defaultNow(),
})

export type SocialLinks = Partial<
  Record<'instagram' | 'facebook' | 'tiktok' | 'x' | 'linkedin' | 'youtube', string>
>

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: citext('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  timezone: text('timezone').notNull(),
  locale: text('locale').notNull().default('en'),
  currency: char('currency', { length: 3 }).notNull().default('EUR'),
  email: citext('email'),
  phone: text('phone'),
  website: text('website'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  postalCode: text('postal_code'),
  country: text('country'),
  socialLinks: jsonb('social_links').$type<SocialLinks>().notNull().default({}),
  brandColor: text('brand_color').notNull().default('#0f766e'),
  logoAssetId: uuid('logo_asset_id'),
  coverAssetId: uuid('cover_asset_id'),
  status: businessStatus('status').notNull().default('active'),
  suspendedAt: tstz('suspended_at'),
  suspendedReason: text('suspended_reason'),
  // 'admin' (suspended directly) or 'owner_ban' (lifted when the owner is unbanned).
  suspensionSource: text('suspension_source').$type<'admin' | 'owner_ban'>(),
  publishStatus: publishStatus('publish_status').notNull().default('draft'),
  publishedAt: tstz('published_at'),
  pausedMessage: text('paused_message'),
  pausedUntil: tstz('paused_until'),
  allowIndexing: boolean('allow_indexing').notNull().default(true),
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  showStaffOnPage: boolean('show_staff_on_page').notNull().default(true),
  bookingPolicy: text('booking_policy'),
  emailSenderName: text('email_sender_name'),
  emailFooter: text('email_footer'),
  trialEndsAt: tstz('trial_ends_at'),
  onboardingCompletedAt: tstz('onboarding_completed_at'),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
  deletedAt: tstz('deleted_at'),
})
export type Business = typeof businesses.$inferSelect

export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  userId: uuid('user_id'),
  name: text('name').notNull(),
  email: citext('email'),
  title: text('title'),
  bio: text('bio'),
  avatarAssetId: uuid('avatar_asset_id'),
  color: text('color').notNull().default('#0f766e'),
  isActive: boolean('is_active').notNull().default(true),
  usesBusinessHours: boolean('uses_business_hours').notNull().default(true),
  position: integer('position').notNull().default(0),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
  deletedAt: tstz('deleted_at'),
})
export type Staff = typeof staff.$inferSelect

export type NotificationPrefs = Partial<
  Record<
    'booking_created' | 'booking_cancelled' | 'booking_rescheduled' | 'billing' | 'team',
    boolean
  >
>

export const businessMembers = pgTable('business_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  userId: uuid('user_id').notNull(),
  role: memberRole('role').notNull(),
  staffId: uuid('staff_id'),
  notificationPrefs: jsonb('notification_prefs').$type<NotificationPrefs>().notNull().default({}),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
})

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  email: citext('email').notNull(),
  role: memberRole('role').notNull(),
  staffId: uuid('staff_id'),
  tokenHash: text('token_hash').notNull(),
  invitedBy: uuid('invited_by'),
  expiresAt: tstz('expires_at').notNull(),
  acceptedAt: tstz('accepted_at'),
  revokedAt: tstz('revoked_at'),
  createdAt: tstz('created_at').notNull().defaultNow(),
})

export const serviceCategories = pgTable('service_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
})

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  categoryId: uuid('category_id'),
  name: text('name').notNull(),
  description: text('description'),
  durationMinutes: integer('duration_minutes').notNull(),
  priceCents: integer('price_cents'),
  bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
  bufferAfterMinutes: integer('buffer_after_minutes').notNull().default(0),
  color: text('color').notNull().default('#0f766e'),
  isActive: boolean('is_active').notNull().default(true),
  isVisible: boolean('is_visible').notNull().default(true),
  position: integer('position').notNull().default(0),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
  deletedAt: tstz('deleted_at'),
})
export type Service = typeof services.$inferSelect

export const staffServices = pgTable(
  'staff_services',
  {
    businessId: uuid('business_id').notNull(),
    staffId: uuid('staff_id').notNull(),
    serviceId: uuid('service_id').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.serviceId] })],
)

export const weeklyHours = pgTable('weekly_hours', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  staffId: uuid('staff_id'),
  weekday: smallint('weekday').notNull(),
  startMinute: integer('start_minute').notNull(),
  endMinute: integer('end_minute').notNull(),
  createdAt: tstz('created_at').notNull().defaultNow(),
})

export const specialHours = pgTable('special_hours', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  staffId: uuid('staff_id'),
  onDate: date('on_date', { mode: 'string' }).notNull(),
  startMinute: integer('start_minute').notNull(),
  endMinute: integer('end_minute').notNull(),
  createdAt: tstz('created_at').notNull().defaultNow(),
})

export const closures = pgTable('closures', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  staffId: uuid('staff_id'),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  endsOn: date('ends_on', { mode: 'string' }).notNull(),
  label: text('label'),
  recurringYearly: boolean('recurring_yearly').notNull().default(false),
  createdAt: tstz('created_at').notNull().defaultNow(),
})

export const timeBlocks = pgTable('time_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  staffId: uuid('staff_id'),
  startsAt: tstz('starts_at').notNull(),
  endsAt: tstz('ends_at').notNull(),
  reason: text('reason'),
  createdAt: tstz('created_at').notNull().defaultNow(),
})

export const bookingRules = pgTable('booking_rules', {
  businessId: uuid('business_id').primaryKey(),
  minNoticeMinutes: integer('min_notice_minutes').notNull().default(120),
  maxAdvanceDays: integer('max_advance_days').notNull().default(60),
  slotIntervalMinutes: integer('slot_interval_minutes').notNull().default(15),
  cancellationDeadlineMinutes: integer('cancellation_deadline_minutes').notNull().default(1440),
  rescheduleDeadlineMinutes: integer('reschedule_deadline_minutes').notNull().default(1440),
  allowCustomerCancel: boolean('allow_customer_cancel').notNull().default(true),
  allowCustomerReschedule: boolean('allow_customer_reschedule').notNull().default(true),
  requiresConfirmation: boolean('requires_confirmation').notNull().default(false),
  maxBookingsPerDay: integer('max_bookings_per_day'),
  reminderOffsetsMinutes: integer('reminder_offsets_minutes')
    .array()
    .notNull()
    .default([1440, 120]),
  staffSelection: staffSelectionMode('staff_selection').notNull().default('optional'),
  phoneRequirement: fieldRequirement('phone_requirement').notNull().default('required'),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
})
export type BookingRules = typeof bookingRules.$inferSelect

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: citext('email'),
  phone: text('phone'),
  internalNotes: text('internal_notes'),
  erasedAt: tstz('erased_at'),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
})
export type Customer = typeof customers.$inferSelect

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  reference: text('reference').notNull(),
  serviceId: uuid('service_id').notNull(),
  staffId: uuid('staff_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  status: appointmentStatus('status').notNull(),
  startsAt: tstz('starts_at').notNull(),
  endsAt: tstz('ends_at').notNull(),
  blockedFrom: tstz('blocked_from').notNull(),
  blockedUntil: tstz('blocked_until').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  priceCents: integer('price_cents'),
  currency: char('currency', { length: 3 }).notNull(),
  timezone: text('timezone').notNull(),
  source: appointmentSource('source').notNull().default('booking_page'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  referrerHost: text('referrer_host'),
  customerMessage: text('customer_message'),
  internalNotes: text('internal_notes'),
  manageNonce: text('manage_nonce').notNull(),
  createdByUserId: uuid('created_by_user_id'),
  confirmedAt: tstz('confirmed_at'),
  completedAt: tstz('completed_at'),
  cancelledAt: tstz('cancelled_at'),
  cancelledBy: actorType('cancelled_by'),
  cancellationReason: text('cancellation_reason'),
  rescheduleCount: integer('reschedule_count').notNull().default(0),
  /** Language the customer booked in: their emails and manage page use it. */
  locale: text('locale').notNull().default('en'),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
})
export type Appointment = typeof appointments.$inferSelect

export const appointmentEvents = pgTable('appointment_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  appointmentId: uuid('appointment_id').notNull(),
  event: text('event')
    .$type<
      | 'created'
      | 'confirmed'
      | 'rescheduled'
      | 'cancelled'
      | 'completed'
      | 'no_show'
      | 'edited'
      | 'reopened'
    >()
    .notNull(),
  fromStatus: appointmentStatus('from_status'),
  toStatus: appointmentStatus('to_status'),
  previousStartsAt: tstz('previous_starts_at'),
  newStartsAt: tstz('new_starts_at'),
  actor: actorType('actor').notNull(),
  actorUserId: uuid('actor_user_id'),
  note: text('note'),
  createdAt: tstz('created_at').notNull().defaultNow(),
})

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id'),
  appointmentId: uuid('appointment_id'),
  channel: text('channel').$type<'email'>().notNull().default('email'),
  template: text('template').notNull(),
  recipient: text('recipient').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  status: notificationStatus('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  sendAfter: tstz('send_after').notNull().defaultNow(),
  lockedUntil: tstz('locked_until'),
  lastError: text('last_error'),
  providerMessageId: text('provider_message_id'),
  dedupeKey: text('dedupe_key'),
  sentAt: tstz('sent_at'),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
})

export const inboxItems = pgTable('inbox_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  userId: uuid('user_id').notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  href: text('href'),
  readAt: tstz('read_at'),
  createdAt: tstz('created_at').notNull().defaultNow(),
})

export const subscriptions = pgTable('subscriptions', {
  businessId: uuid('business_id').primaryKey(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripePriceId: text('stripe_price_id'),
  status: text('status').$type<SubscriptionStatus>(),
  currentPeriodEnd: tstz('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  canceledAt: tstz('canceled_at'),
  trialEnd: tstz('trial_end'),
  lastPaymentFailedAt: tstz('last_payment_failed_at'),
  lastEventAt: tstz('last_event_at'),
  // What this subscription actually costs per month (from its Stripe price).
  unitAmountCents: integer('unit_amount_cents'),
  priceCurrency: char('price_currency', { length: 3 }),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
})
export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused'
export type Subscription = typeof subscriptions.$inferSelect

export const billingEvents = pgTable('billing_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  businessId: uuid('business_id'),
  stripeCreatedAt: tstz('stripe_created_at').notNull(),
  status: text('status').$type<'processing' | 'processed' | 'ignored' | 'failed'>().notNull(),
  error: text('error'),
  summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
  receivedAt: tstz('received_at').notNull().defaultNow(),
  processedAt: tstz('processed_at'),
})

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id'),
  actor: actorType('actor').notNull(),
  actorUserId: uuid('actor_user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  ip: text('ip'),
  requestId: text('request_id'),
  createdAt: tstz('created_at').notNull().defaultNow(),
})

export type AssetVariants = Record<string, { key: string; width: number; height: number }>

export const uploadedAssets = pgTable('uploaded_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  kind: assetKind('kind').notNull(),
  storageKey: text('storage_key').notNull(),
  contentType: text('content_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  variants: jsonb('variants').$type<AssetVariants>().notNull().default({}),
  createdBy: uuid('created_by'),
  createdAt: tstz('created_at').notNull().defaultNow(),
})

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  description: text('description').notNull().default(''),
  enabled: boolean('enabled').notNull().default(false),
  businessAllowlist: uuid('business_allowlist').array().notNull().default([]),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
})

export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
})

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetAt: tstz('reset_at').notNull(),
})

export const bookingPageEvents = pgTable('booking_page_events', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  businessId: uuid('business_id').notNull(),
  step: funnelStep('step').notNull(),
  source: appointmentSource('source').notNull().default('booking_page'),
  utmCampaign: text('utm_campaign'),
  occurredAt: tstz('occurred_at').notNull().defaultNow(),
})

/** Monthly plan price history; the newest row is the current price (0004_admin). */
export const planPrices = pgTable('plan_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  amountCents: integer('amount_cents').notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  stripePriceId: text('stripe_price_id').notNull(),
  livemode: boolean('livemode').notNull().default(false),
  previousAmountCents: integer('previous_amount_cents'),
  previousStripePriceId: text('previous_stripe_price_id'),
  createdAt: tstz('created_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  effectiveForExistingAt: tstz('effective_for_existing_at').notNull(),
})
export type PlanPriceRow = typeof planPrices.$inferSelect

export const planPriceMigrations = pgTable(
  'plan_price_migrations',
  {
    planPriceId: uuid('plan_price_id').notNull(),
    businessId: uuid('business_id').notNull(),
    stripeSubscriptionId: text('stripe_subscription_id').notNull(),
    status: text('status').$type<'pending' | 'done' | 'failed' | 'skipped'>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: tstz('next_attempt_at'),
    lastError: text('last_error'),
    migratedAt: tstz('migrated_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.planPriceId, t.businessId] })],
)
