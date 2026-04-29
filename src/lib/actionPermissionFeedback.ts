import type { ActionPermission } from '../ontology/rules/permission.rules'

/**
 * 액션 실행 직전 권한 거부 시 사용자 메시지 + DEV 콘솔 경고.
 */
export function consumeActionPermission(
  result: ActionPermission,
  onDeniedUserMessage: (message: string) => void,
): result is { ok: true } {
  if (result.ok) return true
  if (import.meta.env.DEV) {
    console.warn('[action-permission]', result.devDetail)
  }
  onDeniedUserMessage(result.userMessage)
  return false
}
