import type { SubscriptionPlan, SubscriptionStatus } from '../objects/shared'

export function isSubscriptionActive(
  _status: SubscriptionStatus,
  _endedAt: string | null,
): boolean {
  // TODO: status + ended_at 조합
  return false
}

export function canUseFeature(
  _plan: SubscriptionPlan,
  _feature: 'location' | 'alerts' | 'partner_care',
): boolean {
  // TODO: 요금제별 플래그
  return false
}
