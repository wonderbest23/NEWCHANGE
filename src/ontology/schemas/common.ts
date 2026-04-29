import { z } from 'zod'

export const uuidSchema = z.uuid()

export const optionalIsoDateTimeSchema = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid ISO date string' })
