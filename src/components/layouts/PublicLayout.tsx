import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, LogOut, User as UserIcon } from "lucide-react";
import { SiteFooter } from "@/components/layouts/SiteFooter";
import { useAuth } from "@/lib/auth/mock-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAppState } from "@/lib/auth/use-app-state";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // 공유 캐시 — 다른 페이지에서 이미 받아왔다면 네트워크 호출 없이 즉시 반환됨
  const { data: appState } = useAppState({ enabled: pathname !== "/auth" });
  const dashboardTo = appState?.destination ?? "/community";
  const initial = user?.nickname?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "곁";

  return (
    <div className="relative flex min-h-screen flex-col bg-warm-gradient">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
      >
        본문으로 건너뛰기
      </a>

      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" />

          <div className="flex items-center gap-2">
            {isAuthenticated && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-2 py-1 pr-3 text-sm text-foreground transition-colors hover:bg-surface"
                    aria-label="내 계정 메뉴 열기"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-foreground text-[11px] text-background">
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-[7rem] truncate sm:inline">{user.nickname}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-foreground">{user.nickname}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to={dashboardTo as "/home"} className="flex items-center gap-2">
                      <UserIcon className="h-4 w-4" />
                      내 화면
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/community" className="flex items-center gap-2">
                      <UserIcon className="h-4 w-4" />
                      커뮤니티
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      signOut();
                      navigate({ to: "/" });
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    로그아웃
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild size="sm" variant="hero" className="gap-1">
                <Link to="/auth">
                  시작하기
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
