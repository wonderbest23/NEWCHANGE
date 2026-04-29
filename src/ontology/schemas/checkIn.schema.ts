import { z } from 'zod'
import { uuidSchema } from './common'

const source = z.enum(['self', 'guardian', 'ai_call', 'partner'])

export const submitCheckInInputSchema = z.object({
  careRecipientId: uuidSchema,
  mood: z.string().min(1).max(200),
  bodyCondition: z.string().min(1).max(200),
  note: z.string().max(5000).nullable().optional(),
  source,
})

export type SubmitCheckInInput = z.infer<typeof submitCheckInInputSchema>
