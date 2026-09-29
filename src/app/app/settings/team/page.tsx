import type { Metadata } from 'next'
import Link from 'next/link'
import { requireTenantPage } from '@/server/tenancy/context'
import { listTeam } from '@/server/business/team'
import { listStaff } from '@/server/business/catalog'
import { assignableRoles } from '@/server/tenancy/permissions'
import { getFormatLocale, getT } from '@/server/i18n'
import { formatDateShort, formatRelative } from '@/lib/format'
import { rich } from '@/components/i18n/rich'
import {
  RolesExplainer,
  TeamManager,
  type PendingInvite,
  type TeamMember,
} from '@/components/settings/team-manager'
import { SettingsIntro } from '@/components/settings/section'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-settings')
  return { title: t('team.metaTitle') }
}

function describeInvites(
  invites: Awaited<ReturnType<typeof listTeam>>['invites'],
  tag: string,
  now = new Date(),
): PendingInvite[] {
  return invites.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    expired: i.expiresAt.getTime() < now.getTime(),
    expiresLabel: formatRelative(i.expiresAt, now, tag),
    sentLabel: formatRelative(i.createdAt, now, tag),
  }))
}

export default async function TeamSettingsPage() {
  const ctx = await requireTenantPage('team.manage')
  const [{ members, invites }, staff, t, tag] = await Promise.all([
    listTeam(ctx),
    listStaff(ctx),
    getT('app-settings'),
    getFormatLocale(),
  ])
  const tz = ctx.business.timezone
  const rows: TeamMember[] = members.map((m) => ({
    id: m.id,
    role: m.role,
    userId: m.userId,
    name: m.name,
    email: m.email,
    staffName: m.staffName,
    joined: formatDateShort(m.createdAt, tz, tag),
  }))
  return (
    <div className="grid grid-cols-1 gap-6">
      <SettingsIntro
        title={t('team.title')}
        description={rich(t('team.description'), {
          link: (c) => (
            <Link href="/app/staff" className="font-medium text-primary hover:underline">
              {c}
            </Link>
          ),
        })}
      />
      <TeamManager
        members={rows}
        invites={describeInvites(invites, tag)}
        me={{ userId: ctx.user.id, role: ctx.membership.role }}
        assignable={assignableRoles(ctx.membership.role)}
        staff={staff
          .filter((s) => !s.userId)
          .map((s) => ({ id: s.id, name: s.name, title: s.title, email: s.email }))}
      />
      <RolesExplainer />
    </div>
  )
}
