import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { and, count, eq, isNull } from 'drizzle-orm'
import { requireUserPage, listMemberships, optionalTenant } from '@/server/tenancy/context'
import { db } from '@/server/db/client'
import { services } from '@/server/db/schema'
import { appUrl } from '@/server/env'
import { OnboardingWizard } from '@/components/onboarding/wizard'
import { site } from '@/lib/site'

export const metadata: Metadata = { title: 'Set up your booking page', robots: { index: false } }

export default async function OnboardingPage({ searchParams }: PageProps<'/onboarding'>) {
  const session = await requireUserPage('/onboarding')
  const sp = await searchParams
  const memberships = await listMemberships(session.user.id)
  const creatingAnother = sp.new === '1'
  let resume: { name: string; slug: string; step: number } | null = null
  if (memberships.length > 0 && !creatingAnother) {
    const ctx = await optionalTenant()
    if (!ctx || ctx.business.onboardingCompletedAt || ctx.membership.role !== 'owner') redirect('/app')
    const [svc] = await db().select({ n: count() }).from(services).where(and(eq(services.businessId, ctx.business.id), isNull(services.deletedAt)))
    resume = { name: ctx.business.name, slug: ctx.business.slug, step: (svc?.n ?? 0) > 0 ? 4 : 2 }
  }
  return (
    <OnboardingWizard
      userName={session.user.name}
      emailVerified={session.user.emailVerified}
      email={session.user.email}
      resume={resume}
      origin={appUrl('/').replace(/\/$/, '')}
      trialDays={site.trialDays}
    />
  )
}
