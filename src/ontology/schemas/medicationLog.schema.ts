import { z } from 'zod'
import { optionalIsoDateTimeSchema, uuidSchema } from './common'

const medStatus = z.enum(['taken', 'missed', 'skipped'])

export const createMedicationLogInputSchema = z.object({
  medicationId: uuidSchema,
  careRecipientId: uuidSchema,
  takenAt: optionalIsoDateTimeSchema,
  status: medStatus,
  createdBy: uuidSchema,
})

export type CreateMedicationLogInput = z.infer<typeof createMedicationLogInputSchema>
