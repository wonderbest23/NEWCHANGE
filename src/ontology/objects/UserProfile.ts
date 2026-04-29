import type { ISODateString, UUID } from './shared'

/**
 * auth.users 1:1 — 사람의 기본 프로필
 */
export interface UserProfile {
  id: UUID
  displayName: string
  phone: string | null
  birthYear: number | null
  createdAt: ISODateString
  updatedAt: ISODateString
}
