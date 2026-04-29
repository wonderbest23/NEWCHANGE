import type { ISODateString, UUID } from './shared'

export type AuditMetadata = Record<string, unknown>

export interface AuditLog {
  id: UUID
  actorId: UUID
  action: string
  entityType: string
  entityId: UUID
  metadata: AuditMetadata
  createdAt: ISODateString
}
