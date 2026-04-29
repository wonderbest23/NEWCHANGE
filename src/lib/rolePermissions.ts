import type { CareAppRole } from './careAppRoles'

/**
 * 클라이언트 UI용 최소 RBAC. 서버·RLS와 중복되지 않으며,
 * 추후 `ontology/rules/permission.rules.ts` 로 옮기기 쉽게 순수 함수만 둔다.
 */
export function hasAnyRole(
  roles: readonly CareAppRole[],
  targets: readonly CareAppRole[],
): boolean {
  const set = new Set(roles)
  return targets.some((t) => set.has(t))
}

export function canAccessAdminFeatures(roles: readonly CareAppRole[]): boolean {
  return roles.includes('admin')
}

export function canAccessPartnerFeatures(roles: readonly CareAppRole[]): boolean {
  return roles.includes('partner')
}

/** 시니어 본인 행동(안부·기록·도움 요청 확정 등) */
export function canWriteSeniorHome(roles: readonly CareAppRole[]): boolean {
  return roles.includes('senior')
}

/** 시니어 화면 조회(부모님 UI 미리보기) */
export function canViewSeniorHome(roles: readonly CareAppRole[]): boolean {
  return hasAnyRole(roles, ['senior', 'guardian'])
}

/**
 * 보호자 대시보드에서 온보딩 외 확장 타일(약·위치 등) 표시.
 * 역할 없음(기본 구간)은 최소 UI만.
 */
export function showGuardianExtendedUi(roles: readonly CareAppRole[]): boolean {
  return roles.includes('guardian')
}

/**
 * 가족 등록/온보딩 등 기본 가디언 동작 — 역할 없음도 허용(기본 구간 정책과 동일).
 */
export function canUseGuardianFamilyActions(roles: readonly CareAppRole[]): boolean {
  return roles.length === 0 || roles.includes('guardian')
}
