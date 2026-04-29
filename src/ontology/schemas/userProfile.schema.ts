import { z } from 'zod'
import { uuidSchema } from './common'

export const createUserProfileInputSchema = z.object({
  displayName: z.string().min(1).max(200),
  phone: z.string().min(1).max(32).nullable().optional(),
  birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
})

export type CreateUserProfileInput = z.infer<typeof createUserProfileInputSchema>

export const updateUserProfileInputSchema = z.object({
  id: uuidSchema,
  displayName: z.string().min(1).max(200).optional(),
  phone: z.string().min(1).max(32).nullable().optional(),
  birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
})

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileInputSchema>
