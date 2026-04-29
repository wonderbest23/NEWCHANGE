import { ZodError } from 'zod'
import type { CareAppRole } from '../../lib/careAppRoles'
import type { GuardianInviteResult } from '../objects/GuardianInvite'
import { inviteGuardianInputSchema } from '../schemas/familyMember.schema'
import { checkGuardianCareRecipientRegistrationAction } from '../rules/permission.rules'
import {
  createFamilyGuardianInvite,
  listGuardianFamilyGroupsForProfile,
} from '../repositories/family.repository'

/**
 * 현재 사용자가 속한 가족 그룹에 대해 다른 보호자 초대(링크 복사형)를 만듭니다.
 */
export async function inviteGuardian(
  raw: unknown,
  userId: string,
  roles: readonly CareAppRole[],
): Promise<GuardianInviteResult> {
  const perm = checkGuardianCareRecipientRegistrationAction(roles)
  if (!perm.ok) {
    throw new Error(perm.userMessage)
  }

  let parsed
  try {
    parsed = inviteGuardianInputSchema.parse(raw)
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

  const { inviteId, inviteToken } = await createFamilyGuardianInvite({
    familyGroupId: parsed.familyGroupId,
    invitedEmail: parsed.email.trim(),
    relationship: parsed.relationship ?? null,
  })

  return { inviteId, inviteToken }
}
