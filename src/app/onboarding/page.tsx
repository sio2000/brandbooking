import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { requireUserPage, listMemberships, optionalTenant } from '@/server/tenancy/context'
import { db } from '@/server/db/client'
import { services } from '@/server/db/schema'
import { appUrl, isEmailSimulated } from '@/server/env'
import { OnboardingWizard } from '@/components/onboarding/wizard'
import { site } from '@/lib/site'
import { Translations } from '@/components/i18n/translations'

export const metadata: Metadata = { title: 'Set up your booking page', robots: { index: false } }

export default async function OnboardingPage({ searchParams }: PageProps<'/onboarding'>) {
  const session = await requireUserPage('/onboarding')
  const sp = await searchParams
  const memberships = await listMemberships(session.user.id)
  const creatingAnother = sp.new === '1'
  let resume: {
    name: string
    slug: string
    step: number
    category: string | null
    services: Array<{
      id: string
      name: string
      durationMinutes: number
      priceCents: number | null
    }>
  } | null = null
  if (memberships.length > 0 && !creatingAnother) {
    const ctx = await optionalTenant()
    if (!ctx || ctx.business.onboardingCompletedAt || ctx.membership.role !== 'owner')
      redirect('/app')
    const existing = await db()
      .select({
        id: services.id,
        name: services.name,
        durationMinutes: services.durationMinutes,
        priceCents: services.priceCents,
      })
      .from(services)
      .where(and(eq(services.businessId, ctx.business.id), isNull(services.deletedAt)))
      .orderBy(asc(services.position))
    resume = {
      name: ctx.business.name,
      slug: ctx.business.slug,
      step: existing.length > 0 ? 4 : 2,
      category: ctx.business.category,
      services: existing,
    }
  }
  // The wizard's "Delete account" dialog reuses the settings form (app-settings).
  return (
    <Translations ns={['app-settings']}>
      <OnboardingWizard
        userName={session.user.name}
        emailVerified={session.user.emailVerified}
        emailSimulated={isEmailSimulated()}
        email={session.user.email}
        resume={resume}
        origin={appUrl('/').replace(/\/$/, '')}
        trialDays={site.trialDays}
      />
    </Translations>
  )
}
