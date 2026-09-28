import type { Metadata } from 'next'
import { listMemberships, requireTenantPage } from '@/server/tenancy/context'
import { ROLE_LABELS } from '@/server/tenancy/permissions'
import { AccountProfileForm, ChangePasswordForm, DeleteAccountCard, LeaveBusinessCard } from '@/components/settings/account-settings'
import { SettingsIntro } from '@/components/settings/section'

export const metadata: Metadata = { title: 'Your account' }

export default async function AccountSettingsPage() {
  const ctx = await requireTenantPage()
  const memberships = await listMemberships(ctx.user.id)
  const owned = memberships.filter((m) => m.role === 'owner').map((m) => m.name)
  return (
    <div className="grid grid-cols-1 gap-6">
      <SettingsIntro
        title="Your account"
        description={`Personal settings for ${ctx.user.email}. You’re ${ROLE_LABELS[ctx.membership.role] === 'Owner' ? 'the owner' : `a ${ROLE_LABELS[ctx.membership.role].toLowerCase()}`} of ${ctx.business.name}${memberships.length > 1 ? ` and belong to ${memberships.length} businesses in total` : ''}.`}
      />
      <AccountProfileForm name={ctx.user.name} email={ctx.user.email} verified={ctx.user.emailVerified} />
      <ChangePasswordForm />
      {ctx.membership.role !== 'owner' && <LeaveBusinessCard businessName={ctx.business.name} />}
      <DeleteAccountCard ownedBusinesses={owned} />
    </div>
  )
}
