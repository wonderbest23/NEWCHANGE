import type { SubscriptionPlan, SubscriptionStatus } from './shared'
import type { ISODateString, UUID } from './shared'

export interface Subscription {
  id: UUID
  guardianId: UUID
  familyGroupId: UUID
  plan: SubscriptionPlan
  status: SubscriptionStatus
  startedAt: ISODateString
  endedAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}
