'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSession } from '@/server/auth/session'
import { BUSINESS_COOKIE, loadTenant, requireTenantAction } from '@/server/tenancy/context'
import { runAction } from '@/server/actions'
import { AppError } from '@/server/errors'
import { globalSearch } from '@/server/business/search'
import { inbox, markInboxItemsRead } from '@/server/business/overview'
import { env } from '@/server/env'

export async function switchBusinessAction(businessId: string) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!z.uuid().safeParse(businessId).success || !(await loadTenant(session.user.id, businessId))) throw new AppError('forbidden')
  ;(await cookies()).set(BUSINESS_COOKIE, businessId, { httpOnly: true, sameSite: 'lax', path: '/', secure: env().APP_URL.startsWith('https://') })
  redirect('/app')
}

export async function searchAction(q: string) {
  return runAction(async () => {
    const ctx = await requireTenantAction()
    return globalSearch(ctx, String(q ?? ''))
  })
}

export async function inboxAction() {
  return runAction(async () => inbox(await requireTenantAction()))
}

export async function markInboxReadAction(ids?: string[]) {
  return runAction(async () => {
    const ctx = await requireTenantAction()
    const parsed = z.array(z.uuid()).max(100).optional().parse(ids)
    await markInboxItemsRead(ctx, parsed)
    return null
  })
}
