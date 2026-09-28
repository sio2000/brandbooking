import 'server-only'
import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, type Tx } from '@/server/db/client'
import {
  appointments,
  businessMembers,
  serviceCategories,
  services,
  staff,
  staffServices,
  type Service,
  type Staff,
} from '@/server/db/schema'
import { AppError } from '@/server/errors'
import { audit } from '@/server/audit'
import type { TenantContext } from '@/server/tenancy/context'
import type { RequestMeta } from '@/server/request'
import type { z } from 'zod'
import type { serviceSchema, staffSchema } from '@/lib/validation/business'
import { assetUrls, deleteAsset, storeImage, validateImage } from '@/server/storage/images'
import { enforceRateLimits, POLICIES } from '@/server/security/rate-limit'

// ---------------------------------------------------------------------------
// Services & categories
// ---------------------------------------------------------------------------

export async function listServices(ctx: TenantContext) {
  const b = ctx.business.id
  const [rows, cats, links, upcoming] = await Promise.all([
    db()
      .select()
      .from(services)
      .where(and(eq(services.businessId, b), isNull(services.deletedAt)))
      .orderBy(asc(services.position), asc(services.name)),
    db()
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.businessId, b))
      .orderBy(asc(serviceCategories.position), asc(serviceCategories.name)),
    db()
      .select({ serviceId: staffServices.serviceId, staffId: staffServices.staffId })
      .from(staffServices)
      .where(eq(staffServices.businessId, b)),
    db()
      .select({ serviceId: appointments.serviceId, n: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.businessId, b),
          sql`${appointments.startsAt} >= now()`,
          inArray(appointments.status, ['pending', 'confirmed']),
        ),
      )
      .groupBy(appointments.serviceId),
  ])
  const staffIds = new Map<string, string[]>()
  for (const l of links)
    staffIds.set(l.serviceId, [...(staffIds.get(l.serviceId) ?? []), l.staffId])
  const upcomingBy = new Map(upcoming.map((u) => [u.serviceId, Number(u.n)]))
  return {
    services: rows.map((s) => ({
      ...s,
      staffIds: staffIds.get(s.id) ?? [],
      upcomingCount: upcomingBy.get(s.id) ?? 0,
    })),
    categories: cats,
  }
}

async function ensureCategory(
  tx: Tx,
  businessId: string,
  categoryId: string | null,
  newCategory: string | null,
) {
  if (newCategory) {
    const [existing] = await tx
      .select({ id: serviceCategories.id })
      .from(serviceCategories)
      .where(
        and(
          eq(serviceCategories.businessId, businessId),
          sql`lower(${serviceCategories.name}) = lower(${newCategory})`,
        ),
      )
      .limit(1)
    if (existing) return existing.id
    const [created] = await tx
      .insert(serviceCategories)
      .values({ businessId, name: newCategory })
      .returning({ id: serviceCategories.id })
    return created!.id
  }
  if (categoryId) {
    const [cat] = await tx
      .select({ id: serviceCategories.id })
      .from(serviceCategories)
      .where(
        and(eq(serviceCategories.businessId, businessId), eq(serviceCategories.id, categoryId)),
      )
      .limit(1)
    if (!cat) throw new AppError('not_found')
    return cat.id
  }
  return null
}

async function setServiceStaff(tx: Tx, businessId: string, serviceId: string, staffIds: string[]) {
  const valid = staffIds.length
    ? await tx
        .select({ id: staff.id })
        .from(staff)
        .where(
          and(
            eq(staff.businessId, businessId),
            inArray(staff.id, staffIds),
            isNull(staff.deletedAt),
          ),
        )
    : []
  if (valid.length !== new Set(staffIds).size) throw new AppError('not_found')
  await tx
    .delete(staffServices)
    .where(and(eq(staffServices.businessId, businessId), eq(staffServices.serviceId, serviceId)))
  if (valid.length)
    await tx
      .insert(staffServices)
      .values(valid.map((s) => ({ businessId, staffId: s.id, serviceId })))
}

export async function saveService(
  ctx: TenantContext,
  id: string | null,
  input: z.infer<typeof serviceSchema>,
  meta: RequestMeta,
): Promise<Service> {
  const businessId = ctx.business.id
  return db().transaction(async (tx) => {
    const categoryId = await ensureCategory(tx, businessId, input.categoryId, input.newCategory)
    const values = {
      name: input.name,
      description: input.description,
      durationMinutes: input.durationMinutes,
      priceCents: input.price,
      categoryId,
      bufferBeforeMinutes: input.bufferBeforeMinutes,
      bufferAfterMinutes: input.bufferAfterMinutes,
      color: input.color,
      isActive: input.isActive,
      isVisible: input.isVisible,
    }
    let service: Service
    if (id) {
      const [row] = await tx
        .update(services)
        .set(values)
        .where(
          and(eq(services.businessId, businessId), eq(services.id, id), isNull(services.deletedAt)),
        )
        .returning()
      if (!row) throw new AppError('not_found')
      service = row
    } else {
      const [{ max }] = (await tx
        .select({ max: sql<number>`coalesce(max(${services.position}), -1)` })
        .from(services)
        .where(eq(services.businessId, businessId))) as [{ max: number }]
      const [row] = await tx
        .insert(services)
        .values({ businessId, ...values, position: Number(max) + 1 })
        .returning()
      service = row!
    }
    await setServiceStaff(tx, businessId, service.id, input.staffIds)
    await audit(tx, {
      businessId,
      actor: 'user',
      actorUserId: ctx.user.id,
      action: id ? 'service.updated' : 'service.created',
      entityType: 'service',
      entityId: service.id,
      metadata: {
        name: service.name,
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
      },
      ip: meta.ip,
      requestId: meta.requestId,
    })
    return service
  })
}

/** Soft delete: historical appointments keep referencing the service. */
export async function deleteService(ctx: TenantContext, id: string, meta: RequestMeta) {
  const [row] = await db()
    .update(services)
    .set({ deletedAt: new Date(), isActive: false, isVisible: false })
    .where(
      and(
        eq(services.businessId, ctx.business.id),
        eq(services.id, id),
        isNull(services.deletedAt),
      ),
    )
    .returning({ id: services.id, name: services.name })
  if (!row) throw new AppError('not_found')
  await db()
    .delete(staffServices)
    .where(and(eq(staffServices.businessId, ctx.business.id), eq(staffServices.serviceId, id)))
  await audit(db(), {
    businessId: ctx.business.id,
    actor: 'user',
    actorUserId: ctx.user.id,
    action: 'service.deleted',
    entityType: 'service',
    entityId: id,
    metadata: { name: row.name },
    ip: meta.ip,
  })
}

export async function reorderServices(ctx: TenantContext, orderedIds: string[]) {
  await db().transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx
        .update(services)
        .set({ position: i })
        .where(and(eq(services.businessId, ctx.business.id), eq(services.id, id)))
    }
  })
}

export async function deleteCategory(ctx: TenantContext, id: string) {
  await db()
    .delete(serviceCategories)
    .where(and(eq(serviceCategories.businessId, ctx.business.id), eq(serviceCategories.id, id)))
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function listStaff(ctx: TenantContext) {
  const b = ctx.business.id
  const [rows, links, members, upcoming] = await Promise.all([
    db()
      .select()
      .from(staff)
      .where(and(eq(staff.businessId, b), isNull(staff.deletedAt)))
      .orderBy(asc(staff.position), asc(staff.name)),
    db()
      .select({ serviceId: staffServices.serviceId, staffId: staffServices.staffId })
      .from(staffServices)
      .where(eq(staffServices.businessId, b)),
    db()
      .select({
        staffId: businessMembers.staffId,
        role: businessMembers.role,
        userId: businessMembers.userId,
      })
      .from(businessMembers)
      .where(eq(businessMembers.businessId, b)),
    db()
      .select({ staffId: appointments.staffId, n: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.businessId, b),
          sql`${appointments.startsAt} >= now()`,
          inArray(appointments.status, ['pending', 'confirmed']),
        ),
      )
      .groupBy(appointments.staffId),
  ])
  const svc = new Map<string, string[]>()
  for (const l of links) svc.set(l.staffId, [...(svc.get(l.staffId) ?? []), l.serviceId])
  const memberBy = new Map(members.filter((m) => m.staffId).map((m) => [m.staffId!, m]))
  const upcomingBy = new Map(upcoming.map((u) => [u.staffId, Number(u.n)]))
  const avatars = await assetUrls(
    b,
    rows.map((r) => r.avatarAssetId),
    'sm',
  )
  return rows.map((s) => ({
    ...s,
    serviceIds: svc.get(s.id) ?? [],
    member: memberBy.get(s.id) ?? null,
    upcomingCount: upcomingBy.get(s.id) ?? 0,
    avatarUrl: s.avatarAssetId ? (avatars.get(s.avatarAssetId) ?? null) : null,
  }))
}

export async function saveStaff(
  ctx: TenantContext,
  id: string | null,
  input: z.infer<typeof staffSchema>,
  meta: RequestMeta,
): Promise<Staff> {
  const businessId = ctx.business.id
  return db().transaction(async (tx) => {
    const values = {
      name: input.name,
      email: input.email,
      title: input.title,
      bio: input.bio,
      color: input.color,
      isActive: input.isActive,
      usesBusinessHours: input.usesBusinessHours,
    }
    let row: Staff
    if (id) {
      const [r] = await tx
        .update(staff)
        .set(values)
        .where(and(eq(staff.businessId, businessId), eq(staff.id, id), isNull(staff.deletedAt)))
        .returning()
      if (!r) throw new AppError('not_found')
      row = r
    } else {
      const [r] = await tx
        .insert(staff)
        .values({ businessId, ...values })
        .returning()
      row = r!
    }
    const validServices = input.serviceIds.length
      ? await tx
          .select({ id: services.id })
          .from(services)
          .where(
            and(
              eq(services.businessId, businessId),
              inArray(services.id, input.serviceIds),
              isNull(services.deletedAt),
            ),
          )
      : []
    if (validServices.length !== new Set(input.serviceIds).size) throw new AppError('not_found')
    await tx
      .delete(staffServices)
      .where(and(eq(staffServices.businessId, businessId), eq(staffServices.staffId, row.id)))
    if (validServices.length)
      await tx
        .insert(staffServices)
        .values(validServices.map((s) => ({ businessId, staffId: row.id, serviceId: s.id })))
    await audit(tx, {
      businessId,
      actor: 'user',
      actorUserId: ctx.user.id,
      action: id ? 'staff.updated' : 'staff.created',
      entityType: 'staff',
      entityId: row.id,
      metadata: { name: row.name, active: row.isActive },
      ip: meta.ip,
      requestId: meta.requestId,
    })
    return row
  })
}

/**
 * Remove a team member from booking. Their past appointments keep resolving
 * (soft delete); future active appointments must be reassigned or cancelled
 * first so no customer is silently left without a provider.
 */
export async function deleteStaff(ctx: TenantContext, id: string, meta: RequestMeta) {
  const [future] = await db()
    .select({ n: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, ctx.business.id),
        eq(appointments.staffId, id),
        sql`${appointments.startsAt} >= now()`,
        inArray(appointments.status, ['pending', 'confirmed']),
      ),
    )
  if ((future?.n ?? 0) > 0) {
    throw new AppError('validation', {
      fields: {
        _form: `This team member has ${future!.n} upcoming appointment(s). Reschedule or cancel them first.`,
      },
    })
  }
  const [row] = await db()
    .update(staff)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(eq(staff.businessId, ctx.business.id), eq(staff.id, id), isNull(staff.deletedAt)))
    .returning({ id: staff.id, name: staff.name })
  if (!row) throw new AppError('not_found')
  await db()
    .delete(staffServices)
    .where(and(eq(staffServices.businessId, ctx.business.id), eq(staffServices.staffId, id)))
  await audit(db(), {
    businessId: ctx.business.id,
    actor: 'user',
    actorUserId: ctx.user.id,
    action: 'staff.deleted',
    entityType: 'staff',
    entityId: id,
    metadata: { name: row.name },
    ip: meta.ip,
  })
}

export async function uploadStaffAvatar(
  ctx: TenantContext,
  staffId: string,
  file: File,
  meta: RequestMeta,
) {
  await enforceRateLimits([[`upload:user:${ctx.user.id}`, POLICIES.uploadByUser]])
  const [row] = await db()
    .select()
    .from(staff)
    .where(
      and(eq(staff.businessId, ctx.business.id), eq(staff.id, staffId), isNull(staff.deletedAt)),
    )
    .limit(1)
  if (!row) throw new AppError('not_found')
  if (!ctx.can('staff.manage') && ctx.membership.staffId !== staffId)
    throw new AppError('forbidden')
  const image = await validateImage(file, 'avatar')
  const asset = await storeImage(ctx.business.id, 'avatar', image, ctx.user.id)
  await db()
    .update(staff)
    .set({ avatarAssetId: asset.id })
    .where(and(eq(staff.businessId, ctx.business.id), eq(staff.id, staffId)))
  if (row.avatarAssetId) await deleteAsset(ctx.business.id, row.avatarAssetId)
  await audit(db(), {
    businessId: ctx.business.id,
    actor: 'user',
    actorUserId: ctx.user.id,
    action: 'staff.avatar_uploaded',
    entityType: 'staff',
    entityId: staffId,
    ip: meta.ip,
  })
}
