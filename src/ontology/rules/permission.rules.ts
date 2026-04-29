import type { AppRole, UUID } from '../objects/shared'
import type { CareAppRole } from '../../lib/careAppRoles'
import {
  canAccessAdminFeatures,
  canAccessPartnerFeatures,
  canWriteSeniorHome,
  canUseGuardianFamilyActions,
} from '../../lib/rolePermissions'

/**
 * 액션 실행 허용 여부(프론트 1차). 서버·RLS와 맞출 때 동일 조건을 서버에서 재검증.
 */
export type ActionPermission = { ok: true } | { ok: false; userMessage: string; devDetail: string }

function deny(userMessage: string, devDetail: string): ActionPermission {
  return { ok: false, userMessage, devDetail }
}

// --- Care 앱 user_roles 기반(클라이언트에서 roles 배열을 넘겨 호출) ---

/** 운영 감사 로그보내기 등 고위험 admin 액션 */
export function checkAdminAuditExportAction(
  roles: readonly CareAppRole[],
): ActionPermission {
  if (canAccessAdminFeatures(roles)) return { ok: true }
  return deny(
    '이 작업은 관리자만 실행할 수 있어요.',
    `admin:audit_export denied roles=[${roles.join(',')}]`,
  )
}

/** 역할·사용자 일괄 조회 등 admin 액션 */
export function checkAdminUserRolesBulkQueryAction(
  roles: readonly CareAppRole[],
): ActionPermission {
  if (canAccessAdminFeatures(roles)) return { ok: true }
  return deny(
    '이 작업은 관리자만 실행할 수 있어요.',
    `admin:user_roles_bulk_query denied roles=[${roles.join(',')}]`,
  )
}

export function checkPartnerTaskAcceptAction(
  roles: readonly CareAppRole[],
): ActionPermission {
  if (canAccessPartnerFeatures(roles)) return { ok: true }
  return deny(
    '파트너 업무 수락은 파트너 역할이 있을 때만 가능해요.',
    `partner:task_accept denied roles=[${roles.join(',')}]`,
  )
}

export function checkPartnerAssignmentChangeRequestAction(
  roles: readonly CareAppRole[],
): ActionPermission {
  if (canAccessPartnerFeatures(roles)) return { ok: true }
  return deny(
    '배정 변경 요청은 파트너 역할이 있을 때만 가능해요.',
    `partner:assignment_change denied roles=[${roles.join(',')}]`,
  )
}

/** 시니어 홈에서 상태 기록·도움 요청·연락 등 쓰기 계열 */
export function checkSeniorHomeWriteAction(
  roles: readonly CareAppRole[],
  actionId: 'checkin' | 'meds' | 'help' | 'call',
): ActionPermission {
  if (canWriteSeniorHome(roles)) return { ok: true }
  return deny(
    '이 동작은 시니어 본인 계정에서만 실행할 수 있어요.',
    `senior:home_write action=${actionId} denied roles=[${roles.join(',')}]`,
  )
}

/** 가족 온보딩·등록 화면으로 이동(네비게이션) */
export function checkGuardianFamilyOnboardingNavigation(
  roles: readonly CareAppRole[],
): ActionPermission {
  if (canUseGuardianFamilyActions(roles)) return { ok: true }
  return deny(
    '가족 온보딩은 보호자 역할이 있거나 역할이 아직 없는 기본 계정에서만 진행할 수 있어요.',
    `guardian:onboarding_nav denied roles=[${roles.join(',')}]`,
  )
}

/** 첫 care_recipient 등록 등 — 역할 게이트는 온보딩과 동일 */
export const checkGuardianCareRecipientRegistrationAction =
  checkGuardianFamilyOnboardingNavigation

/**
 * RLS·서버 정책과 맞출 권한 규칙 — user_roles 조회는 호출부에서 수행 후 `CareAppRole[]` 로 넘기면
 * `check*` 계열과 동일 조건으로 맞출 수 있음.
 */
export function hasAppRole(
  _userId: UUID,
  role: AppRole,
  rolesFromUserRoles: readonly CareAppRole[] | null,
): boolean {
  if (rolesFromUserRoles == null) return false
  return rolesFromUserRoles.includes(role as CareAppRole)
}

export function isFamilyMember(
  _userId: UUID,
  _familyGroupId: UUID,
): boolean {
  // TODO: family_members 조회
  return false
}

export function canAccessCareRecipient(
  _userId: UUID,
  _careRecipientId: UUID,
): boolean {
  // TODO: 가족·RLS와 일치시킬 규칙
  return false
}

export function isAssignedPartner(
  _userId: UUID,
  _careTaskId: UUID,
): boolean {
  // TODO: care_tasks.assigned_partner_id
  return false
}
