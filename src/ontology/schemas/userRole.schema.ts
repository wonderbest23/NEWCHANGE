import { z } from 'zod'
import { uuidSchema } from './common'

const appRole = z.enum(['guardian', 'senior', 'admin', 'partner'])

export const assignUserRoleInputSchema = z.object({
  userId: uuidSchema,
  role: appRole,
})

export type AssignUserRoleInput = z.infer<typeof assignUserRoleInputSchema>
