import type { FamilyMemberRole } from './shared'
import type { ISODateString, UUID } from './shared'

export interface FamilyMember {
  id: UUID
  familyGroupId: UUID
  profileId: UUID
  memberRole: FamilyMemberRole
  relationship: string | null
  createdAt: ISODateString
}
