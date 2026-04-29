import { z } from 'zod'
import { uuidSchema } from './common'

const scheduleRule = z.record(z.string(), z.unknown())

export const createMedicationInputSchema = z.object({
  careRecipientId: uuidSchema,
  name: z.string().min(1).max(300),
  dosage: z.string().min(1).max(300),
  scheduleRule,
  isActive: z.boolean().optional(),
})

export type CreateMedicationInput = z.infer<typeof createMedicationInputSchema>

export const updateMedicationInputSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(300).optional(),
  dosage: z.string().min(1).max(300).optional(),
  scheduleRule: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
})

export type UpdateMedicationInput = z.infer<typeof updateMedicationInputSchema>
