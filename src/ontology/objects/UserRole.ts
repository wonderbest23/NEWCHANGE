import type { AppRole, ISODateString, UUID } from './shared'

/**
 * 다중 역할: 한 계정이 guardian + admin 등을 가질 수 있음
 */
export interface UserRole {
  id: UUID
  userId: UUID
  role: AppRole
  createdAt: ISODateString
}
