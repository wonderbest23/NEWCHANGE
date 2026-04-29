import { z } from 'zod'
import { optionalIsoDateTimeSchema, uuidSchema } from './common'

export const createLocationConsentInputSchema = z.object({
  careRecipientId: uuidSchema,
  isGranted: z.boolean(),
  version: z.string().min(1).max(32),
  label: z.string().max(200).nullable().optional(),
  expiresAt: optionalIsoDateTimeSchema.nullable().optional(),
})

export type CreateLocationConsentInput = z.infer<typeof createLocationConsentInputSchema>
