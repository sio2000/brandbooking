'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parse, runAction } from '@/server/actions'
import { requestMeta } from '@/server/request'
import { requireTenantAction } from '@/server/tenancy/context'
import { getT } from '@/server/i18n'
import {
  closureSchema,
  specialHoursSchema,
  timeBlockSchema,
  weeklyHoursSchema,
} from '@/lib/validation/business'
import {
  addClosure,
  addTimeBlock,
  clearSpecialHours,
  removeClosure,
  removeTimeBlock,
  saveWeeklyHours,
  setSpecialHours,
  followBusinessHours,
} from '@/server/business/availability-admin'

const PERMS = ['availability.manage', 'availability.manage_own'] as const

function done() {
  revalidatePath('/app/availability')
  revalidatePath('/app', 'layout')
}

export async function saveWeeklyHoursAction(input: unknown) {
  const t = await getT('app-availability')
  return runAction(async () => {
    const ctx = await requireTenantAction([...PERMS])
    await saveWeeklyHours(ctx, parse(weeklyHoursSchema, input), await requestMeta())
    done()
    return null
  }, t('actions.hoursSaved'))
}

export async function followBusinessHoursAction(staffId: string) {
  const t = await getT('app-availability')
  return runAction(async () => {
    const ctx = await requireTenantAction([...PERMS])
    await followBusinessHours(ctx, z.uuid().parse(staffId), await requestMeta())
    done()
    return null
  }, t('actions.following'))
}

export async function addClosureAction(input: unknown) {
  const t = await getT('app-availability')
  return runAction(async () => {
    const ctx = await requireTenantAction([...PERMS])
    await addClosure(ctx, parse(closureSchema, input), await requestMeta())
    done()
    return null
  }, t('actions.closureAdded'))
}

export async function removeClosureAction(id: string) {
  const t = await getT('app-availability')
  return runAction(async () => {
    const ctx = await requireTenantAction([...PERMS])
    await removeClosure(ctx, z.uuid().parse(id), await requestMeta())
    done()
    return null
  }, t('actions.closureRemoved'))
}

export async function setSpecialHoursAction(input: unknown) {
  const t = await getT('app-availability')
  return runAction(async () => {
    const ctx = await requireTenantAction([...PERMS])
    await setSpecialHours(ctx, parse(specialHoursSchema, input), await requestMeta())
    done()
    return null
  }, t('actions.specialSaved'))
}

export async function clearSpecialHoursAction(onDate: string, staffId: string | null) {
  const t = await getT('app-availability')
  return runAction(async () => {
    const ctx = await requireTenantAction([...PERMS])
    const v = z
      .object({ onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), staffId: z.uuid().nullable() })
      .parse({ onDate, staffId })
    await clearSpecialHours(ctx, v.onDate, v.staffId)
    done()
    return null
  }, t('actions.specialRemoved'))
}

export async function addTimeBlockAction(input: unknown) {
  const t = await getT('app-availability')
  return runAction(async () => {
    const ctx = await requireTenantAction([...PERMS])
    await addTimeBlock(ctx, parse(timeBlockSchema, input), await requestMeta())
    done()
    return null
  }, t('actions.blocked'))
}

export async function removeTimeBlockAction(id: string) {
  const t = await getT('app-availability')
  return runAction(async () => {
    const ctx = await requireTenantAction([...PERMS])
    await removeTimeBlock(ctx, z.uuid().parse(id))
    done()
    return null
  }, t('actions.blockRemoved'))
}
