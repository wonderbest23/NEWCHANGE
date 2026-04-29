import type { ISODateString, UUID } from './shared'

/** JSONB schedule_rule — 확장을 위해 unknown 유지(스키마는 Zod에서 record로 검증) */
export type MedicationScheduleRule = Record<string, unknown>

export interface Medication {
  id: UUID
  careRecipientId: UUID
  name: string
  dosage: string
  scheduleRule: MedicationScheduleRule
  isActive: boolean
  createdAt: ISODateString
  updatedAt: ISODateString
}
