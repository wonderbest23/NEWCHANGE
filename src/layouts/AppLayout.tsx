import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Home, LayoutGrid, ListChecks, Shield } from 'lucide-react'
import { useUiPermissions } from '../hooks/useUiPermissions'

export function AppLayout() {
  const { pathname } = useLocation()
  const perm = useUiPermissions()
  const isPartner = pathname.startsWith('/partner')
  const contextLabel = isPartner ? '돌봄 파트너' : '보호자'
  const homeTo = isPartner ? '/partner/tasks' : '/guardian/dashboard'
  const navBase = isPartner
    ? '/partner'
    : '/guardian'

  return (
    <div className="min-h-svh bg-stone-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        본문으로 건너뛰기
      </a>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid
              className="h-6 w-6 text-rose-600"
              aria-hidden
            />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-rose-600/90">
                {contextLabel}
              </p>
              <p className="text-base font-semibold text-care-ink">곁</p>
            </div>
          </div>
          <nav
            className="flex flex-wrap items-center gap-2"
            aria-label="앱 섹션"
          >
            <Link
              to={homeTo}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            >
              <Home className="h-4 w-4" aria-hidden />
              홈
            </Link>
            {!isPartner && (
              <NavLink
                to={`${navBase}/dashboard`}
                className={({ isActive }) =>
                  [
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm',
                    isActive
                      ? 'bg-rose-50 font-medium text-rose-800'
                      : 'text-stone-600 hover:bg-stone-100',
                  ].join(' ')
                }
                end
              >
                <LayoutGrid className="h-4 w-4" aria-hidden />
                대시보드
              </NavLink>
            )}
            {isPartner && (
              <NavLink
                to={`${navBase}/tasks`}
                className={({ isActive }) =>
                  [
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm',
                    isActive
                      ? 'bg-rose-50 font-medium text-rose-800'
                      : 'text-stone-600 hover:bg-stone-100',
                  ].join(' ')
                }
              >
                <ListChecks className="h-4 w-4" aria-hidden />
                업무
              </NavLink>
            )}
            {!isPartner && perm.canAccessPartnerFeatures && (
              <Link
                to="/partner/tasks"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              >
                <ListChecks className="h-4 w-4" aria-hidden />
                파트너 업무
              </Link>
            )}
            {!isPartner && perm.canAccessAdminFeatures && (
              <Link
                to="/admin"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              >
                <Shield className="h-4 w-4" aria-hidden />
                운영
              </Link>
            )}
          </nav>
        </div>
      </header>
      <div
        id="main-content"
        className="mx-auto max-w-6xl px-4 py-6 sm:py-8"
        role="main"
        tabIndex={-1}
      >
        <Outlet />
      </div>
    </div>
  )
}
