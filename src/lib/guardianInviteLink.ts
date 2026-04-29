/**
 * 보호자 초대 수락 페이지로 가는 절대 URL (링크 복사형 MVP).
 * `token` 은 쿼리로 전달; 로그인 후 같은 URL로 돌아와 수락 버튼을 누르면 됨.
 */
export function buildGuardianInviteAcceptUrl(inviteToken: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : ''
  const path = '/invite/guardian'
  const q = new URLSearchParams({ token: inviteToken })
  if (!origin) {
    return `${path}?${q.toString()}`
  }
  return `${origin}${path}?${q.toString()}`
}
