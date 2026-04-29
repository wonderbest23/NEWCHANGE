import { z } from 'zod'
import { optionalIsoDateTimeSchema, uuidSchema } from './common'

const careTaskStatus = z.enum([
  'requested',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
])

export const createCareTaskInputSchema = z.object({
  careRecipientId: uuidSchema,
  taskType: z.string().min(1).max(200),
  scheduledAt: optionalIsoDateTimeSchema.nullable().optional(),
  assignedPartnerId: uuidSchema.nullable().optional(),
  status: careTaskStatus.optional(),
})

export type CreateCareTaskInput = z.infer<typeof createCareTaskInputSchema>

export const assignCareTaskInputSchema = z.object({
  taskId: uuidSchema,
  partnerId: uuidSchema,
})

export type AssignCareTaskInput = z.infer<typeof assignCareTaskInputSchema>

export const updateCareTaskStatusInputSchema = z.object({
  taskId: uuidSchema,
  status: careTaskStatus,
  report: z.string().max(10000).nullable().optional(),
  completedAt: optionalIsoDateTimeSchema.nullable().optional(),
})

export type UpdateCareTaskStatusInput = z.infer<typeof updateCareTaskStatusInputSchema>
