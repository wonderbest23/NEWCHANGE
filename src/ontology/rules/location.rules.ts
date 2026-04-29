import type { LocationConsent } from '../objects/LocationConsent'
import type { LocationPing } from '../objects/LocationPing'

/**
 * 동의 스냅샷과 ping이 일치하는지(동일 id 연계)
 */
export function isPingCoveredByConsent(
  _ping: LocationPing,
  _consent: LocationConsent,
): boolean {
  // TODO: consentSnapshotId + 만료
  return false
}

export function isHighAccuracy(
  _accuracyMeters: number,
  _threshold: number = 200,
): boolean {
  // TODO: 운영 상한
  return false
}
