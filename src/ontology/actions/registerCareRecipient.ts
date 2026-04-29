import { ZodError } from 'zod'
import type { CareAppRole } from '../../lib/careAppRoles'
import type { CareRecipient } from '../objects/CareRecipient'
import { registerCareRecipientInputSchema } from '../schemas/careRecipient.schema'
import { checkGuardianCareRecipientRegistrationAction } from '../rules/permission.rules'
import { listGuardianFamilyGroupsForProfile } from '../repositories/family.repository'
import {
  createCareRecipient,
  listCareRecipientsForFamilyGroup,
} from '../repositories/careRecipient.repository'

/**
 * 보호자가 속한 가족 그룹에 첫 care_recipient 등록(프로필 미연결·표시 이름만).
 */
export async function registerCareRecipient(
  raw: unknown,
  userId: string,
  roles: readonly CareAppRole[],
): Promise<CareRecipient> {
  const perm = checkGuardianCareRecipientRegistrationAction(roles)
  if (!perm.ok) {
    throw new Error(perm.userMessage)
  }

  let parsed
  try {
    parsed = registerCareRecipientInputSchema.parse(raw)
  } catch (e) {
    if (e instanceof ZodError) {
      const first = e.issues[0]
      throw new Error(first?.message ?? '입력을 확인해 주세요.', { cause: e })
    }
    throw e
  }

  const groups = await listGuardianFamilyGroupsForProfile(userId)
  if (!groups.some((g) => g.id === parsed.familyGroupId)) {
    throw new Error('해당 가족 그룹에 보호자로 등록되어 있지 않아요.')
  }

  const existing = await listCareRecipientsForFamilyGroup(parsed.familyGroupId)
  if (existing.length > 0) {
    throw new Error('이 가족 그룹에는 이미 돌봄 대상이 등록되어 있어요.')
  }

  return createCareRecipient({
    familyGroupId: parsed.familyGroupId,
    primaryGuardianId: userId,
    profileId: null,
    recipientDisplayName: parsed.displayName.trim(),
    emergencyNote: parsed.emergencyNote ?? null,
  })
}
