import type { ISODateString, UUID } from './shared'

/** family_members(guardian) + profiles 표시용 최소 필드 */
export interface FamilyGuardianMemberSummary {
  id: UUID
  profileId: UUID
  memberRole: 'guardian'
  relationship: string | null
  displayName: string | null
  createdAt: ISODateString
}
