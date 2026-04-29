import { ZodError } from 'zod'
import type { CareAppRole } from '../../lib/careAppRoles'
import { deleteCareRecipientInputSchema } from '../schemas/careRecipient.schema'
import { checkGuardianCareRecipientRegistrationAction } from '../rules/permission.rules'
import {
  deleteCareRecipient as deleteCareRecipientRepo,
  listCareRecipientsForFamilyGroup,
} from '../repositories/careRecipient.repository'
import { listGuardianFamilyGroupsForProfile } from '../repositories/family.repository'

/**
 * 그룹 보호자가 해당 그룹의 첫 care_recipient(시간순 1건)를 삭제합니다(RPC).
 */
export async function deleteCareRecipient(
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
    parsed = deleteCareRecipientInputSchema.parse(raw)
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
    throw new Error('지금은 그룹에서 가장 먼저 등록된 돌봄 대상만 삭제할 수 있어요.')
  }

  await deleteCareRecipientRepo({
    familyGroupId: parsed.familyGroupId,
    careRecipientId: parsed.careRecipientId,
  })
}
