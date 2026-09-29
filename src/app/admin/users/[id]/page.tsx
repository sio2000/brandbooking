import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2, ScrollText } from 'lucide-react'
import { z } from 'zod'
import { requireAdminPage } from '@/server/tenancy/context'
import { getUserAdmin } from '@/server/admin/users'
import { isAppError } from '@/server/errors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Alert, EmptyState } from '@/components/ui/feedback'
import {
  ActorBadge,
  BusinessStatusBadge,
  DetailList,
  isFuture,
  Mono,
  PageHeader,
  StatusText,
  TableWrap,
  UserBadges,
  UtcTime,
} from '@/components/admin/primitives'
import { CopyButton } from '@/components/admin/copy-button'
import { UserActions } from '@/components/admin/user-actions'
import { LOCALE_META, isLocale } from '@/lib/i18n/config'
import { formatNumber } from '@/lib/format'

export const metadata: Metadata = { title: 'User details' }

async function load(id: string) {
  if (!z.uuid().safeParse(id).success) notFound()
  try {
    return await getUserAdmin(id)
  } catch (err) {
    if (isAppError(err) && err.code === 'not_found') notFound()
    throw err
  }
}

export default async function AdminUserPage({ params }: PageProps<'/admin/users/[id]'>) {
  const session = await requireAdminPage()
  const { id } = await params
  const data = await load(id)
  const u = data.user
  const owned = data.memberships.filter((m) => m.role === 'owner')

  return (
    <>
      <Button
        asChild
        variant="link"
        size="sm"
        className="mb-3 text-muted-foreground hover:text-foreground"
      >
        <Link href="/admin/users">
          <ArrowLeft aria-hidden />
          All users
        </Link>
      </Button>

      <PageHeader
        title={<span className="break-all">{u.email}</span>}
        eyebrow={
          <UserBadges
            admin={u.isPlatformAdmin || u.adminViaEnv}
            banned={Boolean(u.bannedAt)}
            verified={Boolean(u.emailVerifiedAt)}
          />
        }
        description={u.name}
      />

      {u.bannedAt && (
        <Alert tone="danger" title="This account is banned" className="mb-6">
          Since <UtcTime value={u.bannedAt} /> UTC.{' '}
          {u.bannedReason ? <>Reason: {u.bannedReason}</> : 'No reason was recorded.'}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader
            title="Actions"
            description="Each action asks for confirmation and is recorded in the audit log."
          />
          <CardBody className="pt-0">
            <UserActions
              isSelf={u.id === session.user.id}
              user={{
                id: u.id,
                email: u.email,
                name: u.name,
                verified: Boolean(u.emailVerifiedAt),
                banned: Boolean(u.bannedAt),
                isPlatformAdmin: u.isPlatformAdmin,
                adminViaEnv: u.adminViaEnv,
                sessionCount: data.sessionCount,
                ownedBusinesses: owned.map((m) => ({ id: m.businessId, name: m.name })),
              }}
            />
            {(u.isPlatformAdmin || u.adminViaEnv) && u.id !== session.user.id && (
              <p className="mt-3 text-[13px] text-muted-foreground">
                Admins can’t be banned or deleted.{' '}
                {u.adminViaEnv
                  ? 'This account is an admin through PLATFORM_ADMIN_EMAILS.'
                  : 'Revoke admin rights first.'}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Account" />
          <CardBody>
            <DetailList
              items={[
                {
                  label: 'ID',
                  value: (
                    <span className="inline-flex items-center gap-1">
                      <Mono>{u.id}</Mono>
                      <CopyButton value={u.id} label="Copy user ID" />
                    </span>
                  ),
                },
                { label: 'Name', value: u.name },
                {
                  label: 'Email verified',
                  value: u.emailVerifiedAt ? (
                    <StatusText tone="ok">
                      <UtcTime value={u.emailVerifiedAt} />
                    </StatusText>
                  ) : (
                    <StatusText tone="warning">Not verified</StatusText>
                  ),
                },
                {
                  label: 'Language',
                  value: isLocale(u.locale) ? LOCALE_META[u.locale].english : u.locale,
                },
                {
                  label: 'Created',
                  value: (
                    <>
                      <UtcTime value={u.createdAt} /> UTC
                    </>
                  ),
                },
                {
                  label: 'Last sign-in',
                  value: u.lastLoginAt ? (
                    <>
                      <UtcTime value={u.lastLoginAt} /> UTC
                    </>
                  ) : (
                    'Never'
                  ),
                },
                { label: 'Active sessions', value: formatNumber(data.sessionCount) },
                {
                  label: 'Sign-in lock',
                  value: isFuture(u.lockedUntil) ? (
                    <StatusText tone="warning">
                      Locked until <UtcTime value={u.lockedUntil} />
                    </StatusText>
                  ) : (
                    'None'
                  ),
                },
                {
                  label: 'Terms accepted',
                  value: <UtcTime value={u.termsAcceptedAt} mode="date" />,
                },
                {
                  label: 'Platform admin',
                  value: u.isPlatformAdmin
                    ? 'Yes'
                    : u.adminViaEnv
                      ? 'Yes (PLATFORM_ADMIN_EMAILS)'
                      : 'No',
                },
              ]}
            />
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Businesses" description="Memberships and roles" />
          {data.memberships.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No businesses"
              description="This account doesn’t belong to any business."
              className="py-8"
            />
          ) : (
            <TableWrap minWidth="min-w-[28rem]">
              <caption className="sr-only">Business memberships</caption>
              <thead>
                <tr>
                  <th scope="col">Business</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.memberships.map((m) => (
                  <tr key={m.businessId}>
                    <th scope="row">
                      <Link
                        href={`/admin/businesses/${m.businessId}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {m.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">/{m.slug}</span>
                    </th>
                    <td>
                      <Badge
                        tone={m.role === 'owner' ? 'primary' : 'neutral'}
                        className="capitalize"
                      >
                        {m.role}
                      </Badge>
                    </td>
                    <td>
                      <BusinessStatusBadge status={m.status} />
                      {m.suspensionSource === 'owner_ban' && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Because the owner is banned
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Recent activity"
            description="Latest 30 audit entries by or about this account (UTC)"
          />
          {data.audit.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No audit entries"
              description="Sign-ins and account changes appear here."
              className="py-8"
            />
          ) : (
            <TableWrap>
              <caption className="sr-only">Recent audit log entries for this account</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">By</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.map(({ log, actorEmail }) => (
                  <tr key={log.id}>
                    <th scope="row" className="text-muted-foreground">
                      <UtcTime value={log.createdAt} />
                    </th>
                    <td>
                      <ActorBadge actor={log.actor} />
                    </td>
                    <td className="font-mono text-[13px]">{log.action}</td>
                    <td className="max-w-56 truncate text-muted-foreground">{actorEmail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  )
}
