import type { ISODateString, UUID } from './shared'

export interface LocationPing {
  id: UUID
  careRecipientId: UUID
  latitude: number
  longitude: number
  accuracyMeters: number
  consentSnapshotId: UUID
  createdAt: ISODateString
}
