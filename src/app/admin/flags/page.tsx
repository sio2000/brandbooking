import type { Metadata } from 'next'
import { CheckCircle2, CircleOff, Flag, ListChecks } from 'lucide-react'
import { listFlags } from '@/server/admin/admin'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { PageHeader, TableWrap, UtcTime } from '@/components/admin/primitives'
import { DeleteFlagButton, FlagDialog } from '@/components/admin/flag-editor'

export const metadata: Metadata = { title: 'Feature flags' }

function FlagState({ enabled, allowlist }: { enabled: boolean; allowlist: number }) {
  if (enabled)
    return (
      <Badge tone="success">
        <CheckCircle2 aria-hidden />
        On for everyone
      </Badge>
    )
  if (allowlist > 0)
    return (
      <Badge tone="info">
        <ListChecks aria-hidden />
        {allowlist} {allowlist === 1 ? 'business' : 'businesses'}
      </Badge>
    )
  return (
    <Badge tone="neutral">
      <CircleOff aria-hidden />
      Off
    </Badge>
  )
}

export default async function AdminFlagsPage() {
  const flags = await listFlags()

  return (
    <>
      <PageHeader
        title="Feature flags"
        description="Turn features on for every business, or only for an allowlist while testing. Changes apply immediately and are audited."
        actions={<FlagDialog />}
      />

      {flags.length === 0 ? (
        <Card>
          <EmptyState
            icon={Flag}
            title="No feature flags yet"
            description="Create a flag, then check it in code with isFeatureEnabled(key, businessId). Unknown flags are always treated as off."
          />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <TableWrap>
              <caption className="sr-only">Feature flags</caption>
              <thead>
                <tr>
                  <th scope="col">Key</th>
                  <th scope="col">Description</th>
                  <th scope="col">State</th>
                  <th scope="col">Updated (UTC)</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {flags.map((f) => (
                  <tr key={f.key}>
                    <th scope="row" className="font-mono text-[13px] font-medium break-all">
                      {f.key}
                    </th>
                    <td className="max-w-md text-muted-foreground">{f.description || <span className="text-subtle-foreground italic">No description</span>}</td>
                    <td>
                      <FlagState enabled={f.enabled} allowlist={f.businessAllowlist.length} />
                    </td>
                    <td className="text-muted-foreground">
                      <UtcTime value={f.updatedAt} mode="date" />
                    </td>
                    <td className="py-2!">
                      <div className="flex justify-end gap-1">
                        <FlagDialog flag={{ key: f.key, description: f.description, enabled: f.enabled, businessAllowlist: f.businessAllowlist }} />
                        <DeleteFlagButton flagKey={f.key} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          <ul className="grid grid-cols-1 gap-2.5 md:hidden" aria-label="Feature flags">
            {flags.map((f) => (
              <li key={f.key} className="rounded-xl border border-border bg-surface p-4 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-mono text-[13px] font-medium break-all">{f.key}</p>
                  <FlagState enabled={f.enabled} allowlist={f.businessAllowlist.length} />
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.description || 'No description'}</p>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">
                    Updated <UtcTime value={f.updatedAt} mode="date" />
                  </span>
                  <div className="flex gap-1">
                    <FlagDialog flag={{ key: f.key, description: f.description, enabled: f.enabled, businessAllowlist: f.businessAllowlist }} />
                    <DeleteFlagButton flagKey={f.key} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
