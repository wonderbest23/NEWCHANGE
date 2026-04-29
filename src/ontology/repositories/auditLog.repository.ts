import type { AuditLog } from '../objects/AuditLog'
import type { CreateAuditLogInput } from '../schemas/auditLog.schema'

function notImplemented(): never {
  throw new Error('Not implemented')
}

export async function appendAuditLog(
  _input: CreateAuditLogInput,
): Promise<AuditLog> {
  notImplemented()
}

export async function listAuditLogs(
  _entityType: string,
  _entityId: string,
  _limit: number,
): Promise<AuditLog[]> {
  notImplemented()
}
