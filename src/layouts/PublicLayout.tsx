import { Link, NavLink, Outlet } from 'react-router-dom'
import { Heart } from 'lucide-react'

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'text-rose-700 font-medium'
    : 'text-stone-600 hover:text-stone-900'

export function PublicLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-care-cream">
      <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-lg font-semibold text-care-ink"
          >
            <Heart
              className="h-7 w-7 shrink-0 text-rose-500"
              aria-hidden
            />
            <span>곁</span>
          </Link>
          <nav
            className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm sm:text-base"
            aria-label="주요 메뉴"
          >
            <NavLink to="/pricing" className={navClass}>
              요금제
            </NavLink>
            <NavLink to="/auth" className={navClass}>
              로그인
            </NavLink>
            <Link
              to="/onboarding"
              className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700"
            >
              시작하기
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">
        <Outlet />
      </main>
      <footer className="border-t border-stone-200/80 bg-white/60 py-6 text-center text-sm text-care-muted">
        <p>가족 돌봄을 위한 곁</p>
      </footer>
    </div>
  )
}
