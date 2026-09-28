'use server'

import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { parse, runAction } from '@/server/actions'
import { requestMeta } from '@/server/request'
import { getSession } from '@/server/auth/session'
import { AppError } from '@/server/errors'
import { BUSINESS_COOKIE, requireTenantAction } from '@/server/tenancy/context'
import { createBusinessSchema, slugSchema } from '@/lib/validation/business'
import { createBusiness, isSlugAvailable, suggestSlug } from '@/server/business/onboarding'
import { getOrCreateRules } from '@/server/booking/loader'
import { saveBookingRules } from '@/server/business/availability-admin'
import { setPublishState } from '@/server/business/profile'
import { db } from '@/server/db/client'
import { businesses } from '@/server/db/schema'
import { env } from '@/server/env'

export async function suggestSlugAction(name: string) {
  return runAction(async () => {
    if (!(await getSession())) throw new AppError('unauthenticated')
    return suggestSlug(String(name).slice(0, 120))
  })
}

export async function checkSlugAction(slug: string) {
  return runAction(async () => {
    if (!(await getSession())) throw new AppError('unauthenticated')
    const p = slugSchema.safeParse(slug)
    if (!p.success)
      return { available: false, reason: p.error.issues[0]?.message ?? 'Invalid link' }
    return { available: await isSlugAvailable(p.data), reason: null }
  })
}

export async function createBusinessAction(input: unknown) {
  return runAction(async () => {
    const session = await getSession()
    if (!session) throw new AppError('unauthenticated')
    const b = await createBusiness(
      session.user,
      parse(createBusinessSchema, input),
      await requestMeta(),
    )
    ;(await cookies()).set(BUSINESS_COOKIE, b.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: env().APP_URL.startsWith('https://'),
    })
    return { id: b.id, slug: b.slug }
  })
}

const prefsSchema = z.object({
  minNoticeMinutes: z.coerce.number().int().min(0).max(43200),
  allowCustomerCancel: z.boolean(),
  requiresConfirmation: z.boolean(),
})

/** The three booking preferences asked during onboarding; everything else keeps defaults. */
export async function onboardingPrefsAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('settings.manage')
    const v = parse(prefsSchema, input)
    const current = await getOrCreateRules(db(), ctx.business.id)
    await saveBookingRules(
      ctx,
      {
        minNoticeMinutes: v.minNoticeMinutes,
        maxAdvanceDays: current.maxAdvanceDays,
        slotIntervalMinutes: current.slotIntervalMinutes,
        cancellationDeadlineMinutes: current.cancellationDeadlineMinutes,
        rescheduleDeadlineMinutes: current.rescheduleDeadlineMinutes,
        allowCustomerCancel: v.allowCustomerCancel,
        allowCustomerReschedule: v.allowCustomerCancel,
        requiresConfirmation: v.requiresConfirmation,
        maxBookingsPerDay: current.maxBookingsPerDay,
        reminderOffsetsMinutes: current.reminderOffsetsMinutes,
        staffSelection: current.staffSelection,
        phoneRequirement: current.phoneRequirement,
      },
      await requestMeta(),
    )
    return null
  })
}

/**
 * Publishes from the wizard's "Go live" step. Unlike the dashboard's
 * publishAction it doesn't revalidate: publishing marks onboarding complete,
 * and a re-render of /onboarding would redirect to /app before the wizard can
 * show its "Your booking page is live" screen.
 */
export async function publishFromOnboardingAction() {
  return runAction(async () => {
    const ctx = await requireTenantAction('booking_page.manage')
    await setPublishState(
      ctx,
      { action: 'publish', pausedMessage: null, pausedUntil: null },
      await requestMeta(),
    )
    return null
  })
}

export async function finishOnboardingAction() {
  return runAction(async () => {
    const ctx = await requireTenantAction('settings.manage')
    await db()
      .update(businesses)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(businesses.id, ctx.business.id))
    return null
  })
}

const firstServiceSchema = z.object({
  name: z.string().trim().min(1, 'Enter a service name.').max(120),
  durationMinutes: z.coerce.number().int().min(5).max(720),
  price: z.string().trim().max(20).optional().default(''),
})

/**
 * Creates the services added during onboarding (up to 20 at once) and assigns
 * each to every active team member. Field errors come back as
 * `services.<index>.<field>`.
 */
export async function createServicesAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('services.manage')
    const v = parse(
      z.object({
        services: z.array(firstServiceSchema).min(1, 'Add at least one service.').max(20),
      }),
      input,
    )
    const { listStaff, saveService } = await import('@/server/business/catalog')
    const { serviceSchema } = await import('@/lib/validation/business')
    const team = await listStaff(ctx)
    const staffIds = team.filter((s) => s.isActive).map((s) => s.id)
    const meta = await requestMeta()
    // Validate every row before creating any, so a typo never leaves half a list.
    const parsed = v.services.map((row, i) => {
      const r = serviceSchema.safeParse({
        name: row.name,
        durationMinutes: row.durationMinutes,
        price: row.price,
        isActive: true,
        isVisible: true,
        staffIds,
      })
      if (!r.success) {
        const issue = r.error.issues[0]
        throw new AppError('validation', {
          fields: {
            [`services.${i}.${String(issue?.path[0] ?? 'name')}`]:
              issue?.message ?? 'Check this service.',
          },
        })
      }
      return r.data
    })
    const created = []
    for (const data of parsed) {
      const svc = await saveService(ctx, null, data, meta)
      created.push({
        id: svc.id,
        name: svc.name,
        durationMinutes: svc.durationMinutes,
        priceCents: svc.priceCents,
      })
    }
    return { services: created }
  })
}

/** Creates the first service and assigns it to every active team member. */
export async function createFirstServiceAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('services.manage')
    const v = parse(firstServiceSchema, input)
    const { listStaff, saveService } = await import('@/server/business/catalog')
    const { serviceSchema } = await import('@/lib/validation/business')
    const team = await listStaff(ctx)
    const svc = await saveService(
      ctx,
      null,
      serviceSchema.parse({
        name: v.name,
        durationMinutes: v.durationMinutes,
        price: v.price,
        isActive: true,
        isVisible: true,
        staffIds: team.filter((s) => s.isActive).map((s) => s.id),
      }),
      await requestMeta(),
    )
    return { id: svc.id }
  })
}
