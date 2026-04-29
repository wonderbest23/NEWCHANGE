import type { ISODateString, UUID } from './shared'

export interface FamilyGroup {
  id: UUID
  name: string
  createdBy: UUID
  createdAt: ISODateString
  updatedAt: ISODateString
}
