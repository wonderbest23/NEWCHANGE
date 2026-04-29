import { ZodError } from 'zod'
import type { CareAppRole } from '../../lib/careAppRoles'
import { leaveFamilyGroupInputSchema } from '../schemas/familyMember.schema'
import { checkGuardianCareRecipientRegistrationAction } from '../rules/permission.rules'
import {
  leaveFamilyGroup as leaveFamilyGroupRepo,
  listGuardianFamilyGroupsForProfile,
} from '../repositories/family.repository'

/**
 * 현재 사용자가 보호자로 속한 가족 그룹에서 스스로 나갑니다(RPC).
 */
export async function leaveFamilyGroup(
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
    parsed = leaveFamilyGroupInputSchema.parse(raw)
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

  await leaveFamilyGroupRepo(parsed.familyGroupId)
}
