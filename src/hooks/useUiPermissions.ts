import { useMemo } from 'react'
import { useUserRoles } from './useUserRoles'
import type { CareAppRole } from '../lib/careAppRoles'
import {
  canAccessAdminFeatures,
  canAccessPartnerFeatures,
  canWriteSeniorHome,
  canViewSeniorHome,
  showGuardianExtendedUi,
  canUseGuardianFamilyActions,
  hasAnyRole,
} from '../lib/rolePermissions'

/**
 * 화면·버튼 조건부 렌더용. `useUserRoles` 기반, 조회 오류 시 roles 는 빈 배열로 간주.
 */
export function useUiPermissions() {
  const userRoles = useUserRoles()
  const roles: readonly CareAppRole[] = useMemo(
    () => (userRoles.isError ? [] : userRoles.roles),
    [userRoles.isError, userRoles.roles],
  )

  return {
    ...userRoles,
    rolesForUi: roles,
    hasAnyRole: (targets: readonly CareAppRole[]) => hasAnyRole(roles, targets),
    canAccessAdminFeatures: canAccessAdminFeatures(roles),
    canAccessPartnerFeatures: canAccessPartnerFeatures(roles),
    canWriteSeniorHome: canWriteSeniorHome(roles),
    canViewSeniorHome: canViewSeniorHome(roles),
    showGuardianExtendedUi: showGuardianExtendedUi(roles),
    canUseGuardianFamilyActions: canUseGuardianFamilyActions(roles),
  }
}
