import type { MedicationLogStatus } from './shared'
import type { ISODateString, UUID } from './shared'

export interface MedicationLog {
  id: UUID
  medicationId: UUID
  careRecipientId: UUID
  takenAt: ISODateString
  status: MedicationLogStatus
  createdBy: UUID
  createdAt: ISODateString
}
