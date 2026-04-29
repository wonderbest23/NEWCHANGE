import { z } from 'zod'
import { uuidSchema } from './common'

const alertType = z.enum([
  'no_check_in',
  'medication_missed',
  'help_requested',
  'location_unavailable',
  'unusual_inactivity',
  'manual_admin_alert',
])

const severity = z.enum(['low', 'medium', 'high', 'critical'])
const status = z.enum(['open', 'acknowledged', 'resolved'])

export const createAlertInputSchema = z.object({
  careRecipientId: uuidSchema,
  type: alertType,
  severity,
  message: z.string().min(1).max(5000),
  status: status.optional(),
})

export type CreateAlertInput = z.infer<typeof createAlertInputSchema>

export const resolveAlertInputSchema = z.object({
  id: uuidSchema,
  resolvedAt: z
    .string()
    .min(1)
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid ISO date string' })
    .optional(),
})

export type ResolveAlertInput = z.infer<typeof resolveAlertInputSchema>

export const createHelpRequestInputSchema = z.object({
  careRecipientId: uuidSchema,
  message: z.string().min(1).max(5000).optional(),
})

export type CreateHelpRequestInput = z.infer<typeof createHelpRequestInputSchema>
