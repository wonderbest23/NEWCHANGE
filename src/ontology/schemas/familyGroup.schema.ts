import { z } from 'zod'
import { uuidSchema } from './common'

/** RPC `create_family_group_bootstrap` 용 입력(createdBy 는 서버에서 auth.uid()) */
export const createFamilyGroupBootstrapInputSchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, '가족 이름을 입력해 주세요.').max(200, '이름은 200자 이하로 입력해 주세요.')),
  relationship: z
    .string()
    .optional()
    .transform((s) => (s == null ? '' : s.trim()))
    .refine((s) => s.length <= 500, '관계 설명은 500자 이하로 입력해 주세요.')
    .transform((s) => (s === '' ? undefined : s)),
})

export type CreateFamilyGroupBootstrapInput = z.infer<
  typeof createFamilyGroupBootstrapInputSchema
>

export const createFamilyGroupInputSchema = z.object({
  name: z.string().min(1).max(200),
  createdBy: uuidSchema,
})

export type CreateFamilyGroupInput = z.infer<typeof createFamilyGroupInputSchema>

export const updateFamilyGroupInputSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200).optional(),
})

export type UpdateFamilyGroupInput = z.infer<typeof updateFamilyGroupInputSchema>
