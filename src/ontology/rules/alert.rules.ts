import type { AlertSeverity } from '../objects/shared'

const rank: Record<AlertSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

export function compareAlertSeverity(
  a: AlertSeverity,
  b: AlertSeverity,
): -1 | 0 | 1 {
  if (rank[a] < rank[b]) return -1
  if (rank[a] > rank[b]) return 1
  return 0
}

export function shouldEscalateAlert(
  _type: string,
  _consecutiveCount: number,
): boolean {
  // TODO: 운영 기준
  return false
}
