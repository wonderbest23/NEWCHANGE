import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthSession } from '../hooks/useAuthSession'
import { useUserRoles } from '../hooks/useUserRoles'
import { isSupabaseConfigured } from '../lib/supabaseClient'

/**
 * 보호 라우트: 세션 확인 후 비로그인이면 /auth 로 보냄.
 * user_roles 조회는 여기서만 프리패치(캐시)하며, 역할 로딩이 끝날 때까지 Outlet 을 막지 않음.
 */
export function RequireAuth() {
  const { user, loading: sessionLoading } = useAuthSession()
  const location = useLocation()
  useUserRoles()

  if (!isSupabaseConfigured()) {
    return (
      <Navigate
        to="/auth"
        replace
      />
    )
  }

  if (sessionLoading) {
    return (
      <div
        className="flex min-h-svh items-center justify-center bg-stone-100 px-4"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm text-care-muted">세션 확인 중…</p>
      </div>
    )
  }

  if (!user) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`)
    return (
      <Navigate
        to={`/auth?redirect=${redirect}`}
        replace
      />
    )
  }

  return <Outlet />
}
