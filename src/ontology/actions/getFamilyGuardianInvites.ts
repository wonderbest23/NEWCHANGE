import { ZodError } from 'zod'
import type { CareAppRole } from '../../lib/careAppRoles'
import type { FamilyGuardianInviteSummary } from '../objects/FamilyGuardianInvite'
import { getFamilyGuardianInvitesInputSchema } from '../schemas/familyMember.schema'
import { checkGuardianCareRecipientRegistrationAction } from '../rules/permission.rules'
import {
  listFamilyGuardianInvites,
  listGuardianFamilyGroupsForProfile,
} from '../repositories/family.repository'

/**
 * 현재 사용자가 보호자로 속한 가족 그룹의 보호자 초대 목록을 조회합니다(읽기 전용).
 */
export async function getFamilyGuardianInvites(
  raw: unknown,
  userId: string,
  roles: readonly CareAppRole[],
): Promise<FamilyGuardianInviteSummary[]> {
  const perm = checkGuardianCareRecipientRegistrationAction(roles)
  if (!perm.ok) {
    throw new Error(perm.userMessage)
  }

  let parsed
  try {
    parsed = getFamilyGuardianInvitesInputSchema.parse(raw)
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

  return listFamilyGuardianInvites(parsed.familyGroupId)
}
