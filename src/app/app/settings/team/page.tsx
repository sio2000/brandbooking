import type { Metadata } from 'next'
import Link from 'next/link'
import { requireTenantPage } from '@/server/tenancy/context'
import { listTeam } from '@/server/business/team'
import { listStaff } from '@/server/business/catalog'
import { assignableRoles } from '@/server/tenancy/permissions'
import { formatDateShort, formatRelative } from '@/lib/format'
import { RolesExplainer, TeamManager, type PendingInvite, type TeamMember } from '@/components/settings/team-manager'
import { SettingsIntro } from '@/components/settings/section'

export const metadata: Metadata = { title: 'Team & access' }

function describeInvites(invites: Awaited<ReturnType<typeof listTeam>>['invites'], now = new Date()): PendingInvite[] {
  return invites.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    expired: i.expiresAt.getTime() < now.getTime(),
    expiresLabel: formatRelative(i.expiresAt, now),
    sentLabel: formatRelative(i.createdAt, now),
  }))
}

export default async function TeamSettingsPage() {
  const ctx = await requireTenantPage('team.manage')
  const [{ members, invites }, staff] = await Promise.all([listTeam(ctx), listStaff(ctx)])
  const tz = ctx.business.timezone
  const rows: TeamMember[] = members.map((m) => ({
    id: m.id,
    role: m.role,
    userId: m.userId,
    name: m.name,
    email: m.email,
    staffName: m.staffName,
    joined: formatDateShort(m.createdAt, tz),
  }))
  return (
    <div className="grid grid-cols-1 gap-6">
      <SettingsIntro
        title="Team & access"
        description={
          <>
            Invite colleagues to sign in with their own login. To add someone who just takes bookings (without a login), add them under{' '}
            <Link href="/app/staff" className="font-medium text-primary hover:underline">
              Team
            </Link>{' '}
            in the sidebar.
          </>
        }
      />
      <TeamManager
        members={rows}
        invites={describeInvites(invites)}
        me={{ userId: ctx.user.id, role: ctx.membership.role }}
        assignable={assignableRoles(ctx.membership.role)}
        staff={staff.filter((s) => !s.userId).map((s) => ({ id: s.id, name: s.name, title: s.title, email: s.email }))}
      />
      <RolesExplainer />
    </div>
  )
}
