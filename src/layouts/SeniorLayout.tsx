import { Outlet } from 'react-router-dom'
import { Heart } from 'lucide-react'

export function SeniorLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-amber-50/90">
      <header className="border-b border-amber-200/80 bg-white/95 px-4 py-5 text-center shadow-sm">
        <div className="mx-auto flex max-w-lg items-center justify-center gap-2">
          <Heart
            className="h-8 w-8 text-rose-500"
            aria-hidden
          />
          <h1 className="text-2xl font-bold tracking-tight text-stone-800 sm:text-3xl">
            곁
          </h1>
        </div>
        <p className="mt-2 text-lg text-stone-600 sm:text-xl">
          오늘도 편안한 하루 보내세요
        </p>
      </header>
      <main
        className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-8"
        id="main-content"
      >
        <Outlet />
      </main>
    </div>
  )
}
