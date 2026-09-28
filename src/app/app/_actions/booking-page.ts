'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parse, runAction } from '@/server/actions'
import { requestMeta } from '@/server/request'
import { requireTenantAction } from '@/server/tenancy/context'
import { brandingSchema, publishSchema, seoSchema, slugSchema } from '@/lib/validation/business'
import {
  changeSlug,
  removeBusinessImage,
  setPublishState,
  updateBranding,
  updateSeo,
  uploadBusinessImage,
} from '@/server/business/profile'
import { isSlugAvailable } from '@/server/business/onboarding'

function done() {
  revalidatePath('/app', 'layout')
  revalidatePath('/book/[slug]', 'page')
}

const MESSAGES = {
  publish: 'Your booking page is live 🎉',
  pause: 'Online booking paused',
  unpublish: 'Booking page unpublished',
}

export async function publishAction(input: unknown) {
  const action = (input as { action?: keyof typeof MESSAGES } | null)?.action
  return runAction(
    async () => {
      const ctx = await requireTenantAction('booking_page.manage')
      await setPublishState(ctx, parse(publishSchema, input), await requestMeta())
      done()
      return null
    },
    action ? MESSAGES[action] : undefined,
  )
}

export async function brandingAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('booking_page.manage')
    await updateBranding(ctx, parse(brandingSchema, input), await requestMeta())
    done()
    return null
  }, 'Branding saved')
}

export async function seoAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireTenantAction('booking_page.manage')
    await updateSeo(ctx, parse(seoSchema, input), await requestMeta())
    done()
    return null
  }, 'Search settings saved')
}

export async function slugAvailableAction(slug: string) {
  return runAction(async () => {
    const ctx = await requireTenantAction('booking_page.manage')
    const parsed = slugSchema.safeParse(slug)
    if (!parsed.success)
      return { available: false, reason: parsed.error.issues[0]?.message ?? 'Invalid' }
    return { available: await isSlugAvailable(parsed.data, ctx.business.id), reason: null }
  })
}

export async function slugAction(slug: string) {
  return runAction(async () => {
    const ctx = await requireTenantAction('booking_page.manage')
    await changeSlug(ctx, slugSchema.parse(slug), await requestMeta())
    done()
    return null
  }, 'Booking link updated')
}

export async function uploadImageAction(form: FormData) {
  return runAction(async () => {
    const ctx = await requireTenantAction('booking_page.manage')
    const kind = z.enum(['logo', 'cover']).parse(form.get('kind'))
    const file = form.get('file')
    if (!(file instanceof File))
      throw new z.ZodError([
        { code: 'custom', path: ['file'], message: 'Choose an image.', input: undefined },
      ])
    await uploadBusinessImage(ctx, kind, file, await requestMeta())
    done()
    return null
  }, 'Image updated')
}

export async function removeImageAction(kind: 'logo' | 'cover') {
  return runAction(async () => {
    const ctx = await requireTenantAction('booking_page.manage')
    await removeBusinessImage(ctx, z.enum(['logo', 'cover']).parse(kind), await requestMeta())
    done()
    return null
  }, 'Image removed')
}
