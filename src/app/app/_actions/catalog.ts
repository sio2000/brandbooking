'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parse, runAction } from '@/server/actions'
import { requestMeta } from '@/server/request'
import { requireTenantAction } from '@/server/tenancy/context'
import { getT } from '@/server/i18n'
import { serviceSchema, staffSchema } from '@/lib/validation/business'
import {
  deleteCategory,
  deleteService,
  deleteStaff,
  reorderServices,
  saveService,
  saveStaff,
  uploadStaffAvatar,
} from '@/server/business/catalog'

export async function saveServiceAction(id: string | null, input: unknown) {
  const t = await getT('app-services')
  return runAction(
    async () => {
      const ctx = await requireTenantAction('services.manage')
      const s = await saveService(
        ctx,
        id ? z.uuid().parse(id) : null,
        parse(serviceSchema, input),
        await requestMeta(),
      )
      revalidatePath('/app', 'layout')
      return { id: s.id }
    },
    id ? t('actions.saved') : t('actions.added'),
  )
}

export async function deleteServiceAction(id: string) {
  const t = await getT('app-services')
  return runAction(async () => {
    const ctx = await requireTenantAction('services.manage')
    await deleteService(ctx, z.uuid().parse(id), await requestMeta())
    revalidatePath('/app', 'layout')
    return null
  }, t('actions.removed'))
}

export async function reorderServicesAction(ids: string[]) {
  return runAction(async () => {
    const ctx = await requireTenantAction('services.manage')
    await reorderServices(ctx, z.array(z.uuid()).max(500).parse(ids))
    revalidatePath('/app/services')
    return null
  })
}

export async function deleteCategoryAction(id: string) {
  const t = await getT('app-services')
  return runAction(async () => {
    const ctx = await requireTenantAction('services.manage')
    await deleteCategory(ctx, z.uuid().parse(id))
    revalidatePath('/app/services')
    return null
  }, t('actions.categoryRemoved'))
}

export async function saveStaffAction(id: string | null, input: unknown) {
  const t = await getT('app-staff')
  return runAction(
    async () => {
      const ctx = await requireTenantAction('staff.manage')
      const s = await saveStaff(
        ctx,
        id ? z.uuid().parse(id) : null,
        parse(staffSchema, input),
        await requestMeta(),
      )
      revalidatePath('/app', 'layout')
      return { id: s.id }
    },
    id ? t('actions.saved') : t('actions.added'),
  )
}

export async function deleteStaffAction(id: string) {
  const t = await getT('app-staff')
  return runAction(async () => {
    const ctx = await requireTenantAction('staff.manage')
    await deleteStaff(ctx, z.uuid().parse(id), await requestMeta())
    revalidatePath('/app', 'layout')
    return null
  }, t('actions.removed'))
}

export async function uploadAvatarAction(form: FormData) {
  const t = await getT('app-staff')
  return runAction(async () => {
    const ctx = await requireTenantAction(['staff.manage', 'availability.manage_own'])
    const staffId = z.uuid().parse(form.get('staffId'))
    const file = form.get('file')
    if (!(file instanceof File))
      throw new z.ZodError([
        { code: 'custom', path: ['file'], message: t('actions.chooseImage'), input: undefined },
      ])
    await uploadStaffAvatar(ctx, staffId, file, await requestMeta())
    revalidatePath('/app/staff')
    return null
  }, t('actions.photoUpdated'))
}
