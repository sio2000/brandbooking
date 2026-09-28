'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parse, runAction } from '@/server/actions'
import { requestMeta } from '@/server/request'
import { requireTenantAction } from '@/server/tenancy/context'
import { serviceSchema, staffSchema } from '@/lib/validation/business'
import { deleteCategory, deleteService, deleteStaff, reorderServices, saveService, saveStaff, uploadStaffAvatar } from '@/server/business/catalog'

export async function saveServiceAction(id: string | null, input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('services.manage')
    const s = await saveService(ctx, id ? z.uuid().parse(id) : null, parse(serviceSchema, input), await requestMeta())
    revalidatePath('/app', 'layout')
    return { id: s.id }
  }, id ? 'Service saved' : 'Service added')
}

export async function deleteServiceAction(id: string) {
  return runAction(async () => {
    const ctx = await requireTenantAction('services.manage')
    await deleteService(ctx, z.uuid().parse(id), await requestMeta())
    revalidatePath('/app', 'layout')
    return null
  }, 'Service removed. Past appointments keep their history.')
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
  return runAction(async () => {
    const ctx = await requireTenantAction('services.manage')
    await deleteCategory(ctx, z.uuid().parse(id))
    revalidatePath('/app/services')
    return null
  }, 'Category removed')
}

export async function saveStaffAction(id: string | null, input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('staff.manage')
    const s = await saveStaff(ctx, id ? z.uuid().parse(id) : null, parse(staffSchema, input), await requestMeta())
    revalidatePath('/app', 'layout')
    return { id: s.id }
  }, id ? 'Team member saved' : 'Team member added')
}

export async function deleteStaffAction(id: string) {
  return runAction(async () => {
    const ctx = await requireTenantAction('staff.manage')
    await deleteStaff(ctx, z.uuid().parse(id), await requestMeta())
    revalidatePath('/app', 'layout')
    return null
  }, 'Team member removed')
}

export async function uploadAvatarAction(form: FormData) {
  return runAction(async () => {
    const ctx = await requireTenantAction(['staff.manage', 'availability.manage_own'])
    const staffId = z.uuid().parse(form.get('staffId'))
    const file = form.get('file')
    if (!(file instanceof File)) throw new z.ZodError([{ code: 'custom', path: ['file'], message: 'Choose an image.', input: undefined }])
    await uploadStaffAvatar(ctx, staffId, file, await requestMeta())
    revalidatePath('/app/staff')
    return null
  }, 'Photo updated')
}
