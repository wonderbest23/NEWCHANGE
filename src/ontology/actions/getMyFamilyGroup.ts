import type { FamilyGroup } from '../objects/FamilyGroup'
import { listGuardianFamilyGroupsForProfile } from '../repositories/family.repository'

/**
 * 현재 프로필(auth user id = profiles.id)이 guardian 멤버로 속한 가족 그룹 중
 * 가장 최근 생성 1건. 없으면 null.
 */
export async function getMyFamilyGroup(profileId: string): Promise<FamilyGroup | null> {
  if (!profileId) return null
  const list = await listGuardianFamilyGroupsForProfile(profileId)
  return list[0] ?? null
}
