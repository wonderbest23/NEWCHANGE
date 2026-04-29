import { ZodError } from 'zod'
import type { CareAppRole } from '../../lib/careAppRoles'
import { cancelFamilyGuardianInviteInputSchema } from '../schemas/familyMember.schema'
import { checkGuardianCareRecipientRegistrationAction } from '../rules/permission.rules'
import {
  cancelFamilyGuardianInvite as cancelFamilyGuardianInviteRepo,
  listGuardianFamilyGroupsForProfile,
} from '../repositories/family.repository'

/**
 * 동일 가족 그룹의 대기 중 보호자 초대를 취소합니다(행 삭제, RPC).
 */
export async function cancelFamilyGuardianInvite(
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
    parsed = cancelFamilyGuardianInviteInputSchema.parse(raw)
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

  await cancelFamilyGuardianInviteRepo(parsed.inviteId)
}
