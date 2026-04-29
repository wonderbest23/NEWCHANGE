import { z } from 'zod'
import { optionalIsoDateTimeSchema, uuidSchema } from './common'

export const saveLocationPingInputSchema = z.object({
  careRecipientId: uuidSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(1_000_000),
  consentSnapshotId: uuidSchema,
  capturedAt: optionalIsoDateTimeSchema.optional(),
})

export type SaveLocationPingInput = z.infer<typeof saveLocationPingInputSchema>
