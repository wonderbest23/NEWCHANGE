import type { AlertSeverity, AlertStatus, AlertType } from './shared'
import type { ISODateString, UUID } from './shared'

export interface Alert {
  id: UUID
  careRecipientId: UUID
  type: AlertType
  severity: AlertSeverity
  status: AlertStatus
  message: string
  createdAt: ISODateString
  resolvedAt: ISODateString | null
}
