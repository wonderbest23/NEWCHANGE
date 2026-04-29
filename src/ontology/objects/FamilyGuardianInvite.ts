import type { UUID } from './shared'

/** family_invites 조회용(토큰·해시 미포함) */
export interface FamilyGuardianInviteSummary {
  id: UUID
  invitedEmail: string
  relationship: string | null
  expiresAt: string
  consumedAt: string | null
  consumedByProfileId: string | null
  createdAt: string
}
