import { ZodError } from 'zod'
import type { CareAppRole } from '../../lib/careAppRoles'
import type { CareRecipient } from '../objects/CareRecipient'
import { updatePrimaryCareRecipientInputSchema } from '../schemas/careRecipient.schema'
import { checkGuardianCareRecipientRegistrationAction } from '../rules/permission.rules'
import { listGuardianFamilyGroupsForProfile } from '../repositories/family.repository'
import {
  listCareRecipientsForFamilyGroup,
  updateCareRecipientDisplayById,
} from '../repositories/careRecipient.repository'

/**
 * 본인이 보호자로 속한 가족 그룹에서, 첫 번째 care_recipient의 표시 이름·비고만 수정.
 */
export async function updatePrimaryCareRecipient(
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
    parsed = updatePrimaryCareRecipientInputSchema.parse(raw)
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

  const list = await listCareRecipientsForFamilyGroup(parsed.familyGroupId)
  const first = list[0]
  if (!first) {
    throw new Error('수정할 돌봄 대상이 없어요. 먼저 등록해 주세요.')
  }

  return updateCareRecipientDisplayById({
    careRecipientId: first.id,
    recipientDisplayName: parsed.displayName.trim(),
    emergencyNote: parsed.emergencyNote ?? null,
  })
}
