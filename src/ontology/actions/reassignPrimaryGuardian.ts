import { ZodError } from 'zod'
import type { CareAppRole } from '../../lib/careAppRoles'
import { reassignPrimaryGuardianInputSchema } from '../schemas/careRecipient.schema'
import { checkGuardianCareRecipientRegistrationAction } from '../rules/permission.rules'
import { listGuardianFamilyGroupsForProfile } from '../repositories/family.repository'
import {
  listCareRecipientsForFamilyGroup,
  reassignPrimaryGuardian as reassignPrimaryGuardianRepo,
} from '../repositories/careRecipient.repository'

/**
 * 같은 가족 그룹의 첫 번째 care_recipient에 대해 주 보호자를 다른 그룹 내 보호자로 변경합니다.
 */
export async function reassignPrimaryGuardian(
  raw: unknown,
  userId: string,
  roles: readonly CareAppRole[],
): Promise<void> {
  const perm = checkGuardianCareRecipientRegistrationAction(roles)
  if (!perm.ok) {
    throw new Error(perm.userMessage)
  }

  let parsed
  try {
    parsed = reassignPrimaryGuardianInputSchema.parse(raw)
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
  if (!first || first.id !== parsed.careRecipientId) {
    throw new Error('첫 번째로 등록된 돌봄 대상만 주 보호자를 바꿀 수 있어요.')
  }

  await reassignPrimaryGuardianRepo({
    familyGroupId: parsed.familyGroupId,
    careRecipientId: parsed.careRecipientId,
    newPrimaryGuardianId: parsed.newPrimaryGuardianId,
  })
}
