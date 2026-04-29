import { Navigate, Outlet } from 'react-router-dom'
import { useUserRoles } from '../hooks/useUserRoles'
import { getDefaultPostLoginPath } from '../lib/authPaths'
import type { CareAppRole } from '../lib/careAppRoles'

type RequireRoleProps = {
  /** 이 중 하나라도 user_roles 에 있으면 하위 라우트 허용 */
  anyOf: readonly CareAppRole[]
  /**
   * true면 `user_roles` 조회가 성공했고 행이 없을 때 통과(guardian 기본 구간).
   * 조회 오류 시에도 기본 구간은 막지 않기 위해 이 플래그가 켜진 경우에만 오류 시 통과.
   */
  allowEmptyRoles?: boolean
}

/**
 * 인증(RequireAuth) 이후 역할 기반 접근 제한.
 * 거부 시 `getDefaultPostLoginPath`로 보내 무한 리다이렉트를 피함.
 */
export function RequireRole({ anyOf, allowEmptyRoles }: RequireRoleProps) {
  const {
    roles,
    isRolesLoading,
    status,
    isError,
    hasResolvedNoRoles,
  } = useUserRoles()

  if (isRolesLoading || status === 'roles_loading') {
    return (
      <div
        className="flex min-h-svh items-center justify-center bg-stone-100 px-4"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm text-care-muted">권한 확인 중…</p>
      </div>
    )
  }

  const hasMatchingRole = !isError && roles.some((r) => anyOf.includes(r))
  const allowWhenNoRows =
    Boolean(allowEmptyRoles) && (hasResolvedNoRoles || isError)
  const allowed = hasMatchingRole || allowWhenNoRows

  if (!allowed) {
    return (
      <Navigate
        to={getDefaultPostLoginPath(roles)}
        replace
      />
    )
  }

  return <Outlet />
}
