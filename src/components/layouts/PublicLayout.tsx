import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, MapPin, Mail, Phone, LogOut, User as UserIcon } from "lucide-react";
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

      <footer className="border-t border-border/40 bg-background/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          {/* Top: brand + nav */}
          <div className="grid gap-10 md:grid-cols-[1.5fr_1fr]">
            <div className="flex flex-col gap-3">
              <Logo size="sm" />
              <p className="max-w-sm text-sm text-muted-foreground">
                가족이 함께 만드는 따뜻한 돌봄. 곁이 일상의 안부를 잇습니다.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/70">
                고객 지원
              </h3>
              <a href="mailto:support@gyeot.kr" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span>support@gyeot.kr</span>
              </a>
              <a href="tel:1588-0000" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <Phone className="h-3.5 w-3.5" />
                <span>1588-0000</span>
              </a>
              <p className="text-xs text-muted-foreground">평일 09:00 – 18:00 (점심 12:00 – 13:00)</p>
            </div>
          </div>

          {/* Divider */}
          <div className="my-8 h-px bg-border/60" />

          {/* Business info */}
          <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">㈜곁 (Gyeot Inc.)</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>대표 : 홍길동</span>
              <span>사업자등록번호 : 000-00-00000</span>
              <span>통신판매업신고 : 제 0000-서울강남-00000호</span>
              <span>개인정보보호책임자 : 김보호</span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>서울특별시 강남구 테헤란로 123, 10층 (06234)</span>
            </div>
            <div className="flex flex-col gap-1 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <span>© {new Date().getFullYear()} Gyeot Inc. All rights reserved.</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Link to="/" className="hover:text-foreground">이용약관</Link>
                <Link to="/" className="hover:text-foreground font-medium text-foreground/80">개인정보처리방침</Link>
                <a href="https://www.ftc.go.kr/bizCommPop.do?wrkr_no=0000000000" target="_blank" rel="noreferrer" className="hover:text-foreground">사업자정보확인</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
