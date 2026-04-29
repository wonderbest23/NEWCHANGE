import type { UUID } from './shared'

/** create_family_guardian_invite RPC 1회 응답(원문 토큰은 DB 미저장) */
export interface GuardianInviteResult {
  inviteId: UUID
  inviteToken: string
}
