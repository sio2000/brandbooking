import 'server-only'
import { auditLogs, type ActorType } from '@/server/db/schema'
import type { DbOrTx } from '@/server/db/client'

export type AuditEntry = {
  businessId?: string | null
  actor: ActorType
  actorUserId?: string | null
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
  ip?: string | null
  requestId?: string | null
}

/**
 * Append an audit record. Pass the active transaction so the record commits
 * atomically with the change it describes. Metadata must not contain secrets;
 * keep personal data to the minimum needed to understand the change.
 */
export async function audit(tx: DbOrTx, entry: AuditEntry) {
  await tx.insert(auditLogs).values({
    businessId: entry.businessId ?? null,
    actor: entry.actor,
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata ?? {},
    ip: entry.ip ?? null,
    requestId: entry.requestId ?? null,
  })
}
