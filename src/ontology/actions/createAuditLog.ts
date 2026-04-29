import type { AuditLog } from '../objects/AuditLog'
import type { CreateAuditLogInput } from '../schemas/auditLog.schema'

export async function createAuditLog(
  _input: CreateAuditLogInput,
): Promise<AuditLog> {
  // TODO: Edge/RPC 권한으로만 기록 — repository
  throw new Error('Not implemented: createAuditLog')
}
