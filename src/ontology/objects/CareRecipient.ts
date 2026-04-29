import type { ISODateString, UUID } from './shared'

/**
 * 돌봄 대상(부모님 등) — profile + family 연결
 */
export interface CareRecipient {
  id: UUID
  /** 연결된 시니어 계정이 없으면 null — 이 경우 recipientDisplayName 사용 */
  profileId: UUID | null
  familyGroupId: UUID
  emergencyNote: string | null
  primaryGuardianId: UUID
  /** profile_id 가 없을 때 UI 표시용(005 마이그레이션) */
  recipientDisplayName: string | null
  createdAt: ISODateString
  updatedAt: ISODateString
}
