import type { UUID } from '../objects/shared'

/** 케어 도메인 비즈니스 규칙(안부·수면 등) — 추후 서비스 로직으로 연결 */
export function shouldRemindMedication(
  _careRecipientId: UUID,
  _medicationId: UUID,
): boolean {
  // TODO: schedule_rule + 최근 로그 기반
  return false
}

export function isCheckInOverdue(
  _careRecipientId: UUID,
  _lastCheckInAt: string | null,
): boolean {
  // TODO: 기대 주기·시간대
  return false
}
