import { z } from 'zod'
import { uuidSchema } from './common'

/** 보호자가 가족 그룹 안에 돌봄 대상 1명을 등록할 때(프로필 연결 없이 최소 이름만) */
export const registerCareRecipientInputSchema = z.object({
  familyGroupId: uuidSchema,
  displayName: z
    .string()
    .trim()
    .min(1, '돌봄 대상 이름을 입력해 주세요.')
    .max(200, '이름은 200자 이하로 입력해 주세요.'),
  emergencyNote: z.string().max(5000).nullable().optional(),
})

export type RegisterCareRecipientInput = z.infer<typeof registerCareRecipientInputSchema>

/** 첫 수급자 표시 이름·비고만 수정(가족 그룹은 액션에서 검증) */
export const updatePrimaryCareRecipientInputSchema = z.object({
  familyGroupId: uuidSchema,
  displayName: z
    .string()
    .trim()
    .min(1, '돌봄 대상 이름을 입력해 주세요.')
    .max(200, '이름은 200자 이하로 입력해 주세요.'),
  emergencyNote: z.string().max(5000).nullable().optional(),
})

export type UpdatePrimaryCareRecipientInput = z.infer<typeof updatePrimaryCareRecipientInputSchema>

/** 첫 수급자의 주 보호자 변경(RPC) */
export const reassignPrimaryGuardianInputSchema = z.object({
  familyGroupId: uuidSchema,
  careRecipientId: uuidSchema,
  newPrimaryGuardianId: uuidSchema,
})

export type ReassignPrimaryGuardianInput = z.infer<typeof reassignPrimaryGuardianInputSchema>

/** 첫 수급자 삭제(RPC) — MVP: 그룹 내 시간순 첫 행만 허용(DB에서 검증) */
export const deleteCareRecipientInputSchema = z.object({
  familyGroupId: uuidSchema,
  careRecipientId: uuidSchema,
})

export type DeleteCareRecipientInput = z.infer<typeof deleteCareRecipientInputSchema>

/** 전체 수정용(후속) — 현재 액션에서는 미사용 */
export const updateCareRecipientInputSchema = z.object({
  id: uuidSchema,
  emergencyNote: z.string().max(5000).nullable().optional(),
  primaryGuardianId: uuidSchema.optional(),
})

export type UpdateCareRecipientInput = z.infer<typeof updateCareRecipientInputSchema>
