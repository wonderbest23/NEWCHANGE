import { z } from 'zod'
import { uuidSchema } from './common'

export const createAuditLogInputSchema = z.object({
  actorId: uuidSchema,
  action: z.string().min(1).max(200),
  entityType: z.string().min(1).max(200),
  entityId: uuidSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type CreateAuditLogInput = z.infer<typeof createAuditLogInputSchema>
