import { z } from 'zod'
import { optionalIsoDateTimeSchema, uuidSchema } from './common'

const plan = z.enum(['basic', 'care', 'premium'])
const subStatus = z.enum(['active', 'inactive', 'canceled', 'past_due'])

export const createSubscriptionInputSchema = z.object({
  guardianId: uuidSchema,
  familyGroupId: uuidSchema,
  plan,
  status: subStatus.optional(),
  startedAt: optionalIsoDateTimeSchema.optional(),
  endedAt: optionalIsoDateTimeSchema.nullable().optional(),
})

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionInputSchema>

export const updateSubscriptionInputSchema = z.object({
  id: uuidSchema,
  plan: plan.optional(),
  status: subStatus.optional(),
  endedAt: optionalIsoDateTimeSchema.nullable().optional(),
})

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionInputSchema>
