import type { Metadata } from 'next'
import { listMemberships, requireTenantPage } from '@/server/tenancy/context'
import { getT } from '@/server/i18n'
import {
  AccountLanguageCard,
  AccountProfileForm,
  ChangePasswordForm,
  DeleteAccountCard,
  LeaveBusinessCard,
} from '@/components/settings/account-settings'
import { SettingsIntro } from '@/components/settings/section'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-settings')
  return { title: t('account.metaTitle') }
}

export default async function AccountSettingsPage() {
  const ctx = await requireTenantPage()
  const [memberships, t] = await Promise.all([listMemberships(ctx.user.id), getT('app-settings')])
  const owned = memberships.filter((m) => m.role === 'owner').map((m) => m.name)
  const vars = {
    email: ctx.user.email,
    role: ctx.membership.role,
    business: ctx.business.name,
    count: memberships.length,
  }
  return (
    <div className="grid grid-cols-1 gap-6">
      <SettingsIntro
        title={t('account.title')}
        description={t(memberships.length > 1 ? 'account.introMany' : 'account.intro', vars)}
      />
      <AccountProfileForm
        name={ctx.user.name}
        email={ctx.user.email}
        verified={ctx.user.emailVerified}
      />
      <AccountLanguageCard current={ctx.user.locale} />
      <ChangePasswordForm hasPassword={ctx.user.hasPassword} />
      {ctx.membership.role !== 'owner' && <LeaveBusinessCard businessName={ctx.business.name} />}
      <DeleteAccountCard ownedBusinesses={owned} hasPassword={ctx.user.hasPassword} />
    </div>
  )
}
