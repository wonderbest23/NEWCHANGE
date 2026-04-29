import { ZodError } from 'zod'
import { acceptGuardianInviteInputSchema } from '../schemas/familyMember.schema'
import { acceptFamilyGuardianInvite } from '../repositories/family.repository'

/**
 * 로그인한 사용자가 raw 초대 토큰으로 가족 그룹 보호자 초대를 수락합니다.
 * 이메일 일치·만료·재사용 여부는 RPC에서 검증합니다.
 */
export async function acceptGuardianInvite(raw: unknown): Promise<string> {
  let parsed
  try {
    parsed = acceptGuardianInviteInputSchema.parse(raw)
  } catch (e) {
    if (e instanceof ZodError) {
      const first = e.issues[0]
      throw new Error(first?.message ?? '입력을 확인해 주세요.', { cause: e })
    }
    throw e
  }

  return acceptFamilyGuardianInvite(parsed.inviteToken)
}
