import type { CareAppRole } from './careAppRoles'

/**
 * 로그인/회원가입 직후 기본 랜딩(역할 없음·fallback).
 * 역할별 경로는 `getDefaultPostLoginPath`에서 선택.
 */
export const DEFAULT_POST_LOGIN_PATH = '/guardian/dashboard' as const

/** 라우터와 맞춘 역할별 랜딩(인덱스·첫 화면) */
export const POST_LOGIN_ADMIN_PATH = '/admin' as const
export const POST_LOGIN_PARTNER_PATH = '/partner/tasks' as const
export const POST_LOGIN_SENIOR_PATH = '/senior/home' as const

export type PostLoginPath =
  | typeof DEFAULT_POST_LOGIN_PATH
  | typeof POST_LOGIN_ADMIN_PATH
  | typeof POST_LOGIN_PARTNER_PATH
  | typeof POST_LOGIN_SENIOR_PATH

/**
 * 로그인 직후 이동 경로. 우선순위: admin → partner → senior → 그 외·역할 없음은 보호자 대시보드.
 * `roles`는 `user_roles` 조회 결과(실패 시 빈 배열 권장) — 조회 실패 시에는 빈 배열로 호출해 guardian 으로 내려보냄.
 */
export function getDefaultPostLoginPath(
  roles: readonly CareAppRole[],
): PostLoginPath {
  const set = new Set(roles)
  if (set.has('admin')) return POST_LOGIN_ADMIN_PATH
  if (set.has('partner')) return POST_LOGIN_PARTNER_PATH
  if (set.has('senior')) return POST_LOGIN_SENIOR_PATH
  return DEFAULT_POST_LOGIN_PATH
}
