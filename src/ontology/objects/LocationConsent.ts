import type { ISODateString, UUID } from './shared'

/**
 * 위치 수집·공유에 대한 동의 기록(스냅샷 ID로 pings와 연계)
 */
export interface LocationConsent {
  id: UUID
  careRecipientId: UUID
  isGranted: boolean
  version: string
  label: string | null
  recordedAt: ISODateString
  expiresAt: ISODateString | null
}
