import type { Metadata } from 'next'
import Link from 'next/link'
import { ScrollText } from 'lucide-react'
import { platformAudit } from '@/server/admin/admin'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { ActorBadge, PageHeader, TableWrap, UtcTime } from '@/components/admin/primitives'

export const metadata: Metadata = { title: 'Audit log' }

const LIMIT = 200

function Entity({ type, id }: { type: string | null; id: string | null }) {
  if (!type && !id) return <span className="text-subtle-foreground">—</span>
  return (
    <>
      {type ?? '—'}
      {id && (
        <span
          className="block max-w-52 truncate font-mono text-xs text-subtle-foreground"
          title={id}
        >
          {id}
        </span>
      )}
    </>
  )
}

function BusinessLink({ id, name }: { id: string | null; name: string | null }) {
  if (!id) return <span className="text-subtle-foreground">Platform</span>
  return (
    <Link href={`/admin/businesses/${id}`} className="hover:text-primary hover:underline">
      {name ?? 'Deleted business'}
    </Link>
  )
}

export default async function AdminAuditPage() {
  const rows = await platformAudit(LIMIT)

  return (
    <>
      <PageHeader
        title="Audit log"
        description={`The latest ${LIMIT} security-relevant events across the platform, newest first. Times in UTC.`}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ScrollText}
            title="Nothing logged yet"
            description="Sign-ins, team changes, billing updates and admin actions are recorded here as they happen."
          />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <TableWrap>
              <caption className="sr-only">Platform audit log, latest {LIMIT} entries</caption>
              <thead>
                <tr>
                  <th scope="col">Time (UTC)</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Business</th>
                  <th scope="col">Entity</th>
                  <th scope="col">IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ log, actorEmail, businessName }) => (
                  <tr key={log.id}>
                    <th scope="row" className="text-muted-foreground">
                      <UtcTime value={log.createdAt} />
                    </th>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <ActorBadge actor={log.actor} />
                        {actorEmail && (
                          <span
                            className="max-w-48 truncate text-xs text-muted-foreground"
                            title={actorEmail}
                          >
                            {actorEmail}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="font-mono text-[13px] break-all">{log.action}</td>
                    <td>
                      <BusinessLink id={log.businessId} name={businessName} />
                    </td>
                    <td className="text-muted-foreground">
                      <Entity type={log.entityType} id={log.entityId} />
                    </td>
                    <td className="font-mono text-xs text-muted-foreground">{log.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          <ol
            className="grid grid-cols-1 gap-2 md:hidden"
            aria-label={`Platform audit log, latest ${LIMIT} entries`}
          >
            {rows.map(({ log, actorEmail, businessName }) => (
              <li
                key={log.id}
                className="rounded-xl border border-border bg-surface p-3.5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-mono text-[13px] font-medium break-all">
                    {log.action}
                  </p>
                  <ActorBadge actor={log.actor} />
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Time</dt>
                  <dd className="min-w-0">
                    <UtcTime value={log.createdAt} /> UTC
                  </dd>
                  {actorEmail && (
                    <>
                      <dt className="text-muted-foreground">By</dt>
                      <dd className="min-w-0 truncate">{actorEmail}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Business</dt>
                  <dd className="min-w-0 truncate">
                    <BusinessLink id={log.businessId} name={businessName} />
                  </dd>
                  {(log.entityType || log.entityId) && (
                    <>
                      <dt className="text-muted-foreground">Entity</dt>
                      <dd className="min-w-0 truncate">
                        {log.entityType}
                        {log.entityId && (
                          <span className="font-mono text-subtle-foreground"> {log.entityId}</span>
                        )}
                      </dd>
                    </>
                  )}
                  {log.ip && (
                    <>
                      <dt className="text-muted-foreground">IP</dt>
                      <dd className="font-mono">{log.ip}</dd>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  )
}
