'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { parse, runAction } from '@/server/actions'
import { requestMeta } from '@/server/request'
import { requireTenantAction } from '@/server/tenancy/context'
import { customerSchema } from '@/lib/validation/business'
import { eraseCustomer, saveCustomer } from '@/server/business/customers-admin'
import { getT } from '@/server/i18n'

export async function saveCustomerAction(id: string | null, input: unknown) {
  const t = await getT('app-settings')
  return runAction(
    async () => {
      const ctx = await requireTenantAction('customers.manage')
      const cid = id ? z.uuid().parse(id) : null
      const row = await saveCustomer(ctx, cid, parse(customerSchema, input), await requestMeta())
      revalidatePath('/app/customers', 'layout')
      return { id: row.id }
    },
    id ? t('actions.customers.updated') : t('actions.customers.added'),
  )
}

export async function eraseCustomerAction(id: string) {
  const r = await runAction(async () => {
    const ctx = await requireTenantAction('customers.erase')
    await eraseCustomer(ctx, z.uuid().parse(id), await requestMeta())
    revalidatePath('/app/customers', 'layout')
    return null
  })
  if (r.ok) redirect('/app/customers?erased=1')
  return r
}
