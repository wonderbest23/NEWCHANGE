import type { CheckInSource } from './shared'
import type { ISODateString, UUID } from './shared'

export interface CheckIn {
  id: UUID
  careRecipientId: UUID
  mood: string
  bodyCondition: string
  note: string | null
  source: CheckInSource
  createdAt: ISODateString
}
