import type { CareTaskStatus } from './shared'
import type { ISODateString, UUID } from './shared'

export interface CareTask {
  id: UUID
  careRecipientId: UUID
  assignedPartnerId: UUID | null
  taskType: string
  status: CareTaskStatus
  scheduledAt: ISODateString | null
  completedAt: ISODateString | null
  report: string | null
  createdAt: ISODateString
  updatedAt: ISODateString
}
