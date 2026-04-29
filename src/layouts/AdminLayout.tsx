import { Link, Outlet } from 'react-router-dom'
import { Shield } from 'lucide-react'

export function AdminLayout() {
  return (
    <div className="min-h-svh bg-slate-100">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        본문으로 건너뛰기
      </a>
      <header className="border-b border-slate-700 bg-slate-900 text-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Shield
              className="h-5 w-5 shrink-0"
              aria-hidden
            />
            <span className="font-semibold">운영 콘솔</span>
          </div>
          <Link
            to="/"
            className="text-sm text-slate-300 transition hover:text-white"
          >
            서비스 홈으로
          </Link>
        </div>
      </header>
      <div
        className="mx-auto max-w-6xl px-4 py-6"
        id="admin-main"
        role="main"
        tabIndex={-1}
      >
        <Outlet />
      </div>
    </div>
  )
}
