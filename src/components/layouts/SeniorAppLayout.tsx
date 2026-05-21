import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Home,
  MapPin,
  MessageCircleHeart,
  User,
  LogOut,
  HeartHandshake,
  Mic,
  Smile,
  Sparkles,
  PhoneCall,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/mock-auth";
import { AskFab } from "@/components/ask/AskFab";
import { SiteFooter } from "@/components/layouts/SiteFooter";

const tabs = [
  { to: "/home", label: "홈", icon: Home },
  { to: "/local", label: "동네정보", icon: MapPin },
  { to: "/community", label: "이야기방", icon: MessageCircleHeart },
  { to: "/home/me", label: "내정보", icon: User },
] as const;

export function SeniorAppLayout({
  children,
  subHeader,
}: {
  children: React.ReactNode;
  subHeader?: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const initial = user?.nickname?.[0]?.toUpperCase() ?? "곁";

  return (
    <div className="min-h-screen overflow-x-hidden bg-warm-gradient lg:bg-[#f7f0ea] lg:px-8 xl:px-12">
      <div className="mx-auto grid min-h-screen w-full max-w-full overflow-x-hidden lg:max-w-[1020px] lg:grid-cols-[minmax(0,500px)_430px] lg:items-stretch lg:justify-center lg:gap-8 xl:gap-10">
        <aside className="hidden min-h-screen bg-background lg:flex lg:flex-col lg:justify-center lg:px-10 xl:px-12">
          <div className="max-w-[420px]">
            <Logo size="lg" />
            <div className="mt-16 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-rose-soft/55 px-4 py-2 text-base font-bold text-primary shadow-soft">
              <Sparkles className="h-4 w-4" />
              매일 1분, 음성으로 안부
            </div>

            <h1 className="mt-7 font-display text-[3.25rem] font-bold leading-[1.08] tracking-tight text-foreground">
              오늘도 곁에서
              <br />
              <span className="text-primary">함께 있어요.</span>
            </h1>
            <p className="mt-6 max-w-[360px] text-xl leading-relaxed text-foreground/72">
              한 번의 음성으로 마음과 안부를 전해요.
            </p>

            <div className="mt-12 grid grid-cols-2 gap-4">
              <div className="rounded-[1.5rem] border border-white/80 bg-background/90 p-5 shadow-elevated">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-soft text-primary">
                  <PhoneCall className="h-6 w-6" />
                </div>
                <p className="mt-5 text-2xl font-bold text-primary">안부 통화</p>
                <p className="mt-3 text-base leading-relaxed text-foreground/70">
                  음성으로 마음과 안부를 전해요.
                </p>
                <div className="mt-7 flex items-center justify-center">
                  <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow">
                    <span className="absolute inset-[-10px] rounded-full border border-primary/15" />
                    <Mic className="h-9 w-9" />
                  </span>
                </div>
                <div className="mt-7 flex h-8 items-end justify-center gap-1 text-primary/35">
                  {[10, 18, 24, 16, 9, 14, 28, 20, 12, 16, 22, 11].map((h, i) => (
                    <span
                      key={i}
                      className="w-1.5 rounded-full bg-current"
                      style={{ height: `${h}px` }}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/80 bg-background/90 p-5 shadow-elevated">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-soft text-amber-warm">
                  <Smile className="h-6 w-6" />
                </div>
                <p className="mt-5 text-2xl font-bold text-foreground">오늘의 기분</p>
                <p className="mt-3 text-base leading-relaxed text-foreground/70">
                  오늘 어르신의 기분을 한눈에 확인해요.
                </p>
                <div className="mt-8 rounded-[1.25rem] bg-surface px-5 py-4 text-center shadow-soft">
                  <span className="text-4xl" aria-hidden>
                    😊
                  </span>
                  <span className="ml-3 align-middle text-2xl font-bold text-foreground">
                    좋음
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="relative mx-auto flex min-h-screen w-full max-w-full flex-col overflow-x-hidden bg-warm-gradient pb-32 lg:h-screen lg:min-h-0 lg:max-w-[430px] lg:overflow-hidden lg:border-x lg:border-border/45 lg:bg-background lg:pb-0 lg:shadow-[0_0_36px_rgba(65,45,32,0.14)]">
          <header className="sticky top-0 z-40 shrink-0 border-b-2 border-border/70 bg-background/95 backdrop-blur-xl lg:static">
            <div className="mx-auto flex h-[60px] w-full max-w-full items-center justify-between px-5 lg:max-w-none">
              <Logo size="md" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-full p-1 transition-colors hover:bg-muted"
                    aria-label="내 계정"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="flex flex-col py-2">
                    <span className="truncate text-fluid-base font-semibold">{user?.nickname}</span>
                    <span className="truncate text-fluid-sm font-normal text-muted-foreground">
                      {user?.email}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="py-3 text-fluid-base">
                    <Link to="/home/invite" className="flex items-center gap-3">
                      <HeartHandshake className="h-5 w-5" /> 가족 초대하기
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={async (e) => {
                      e.preventDefault();
                      await signOut();
                      navigate({ to: "/" });
                    }}
                    className="py-3 text-fluid-base text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-5 w-5" /> 로그아웃
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {subHeader && (
            <div className="border-b border-border/30 bg-background">
              {subHeader}
            </div>
          )}

          <main className="mx-auto w-full max-w-full flex-1 overflow-x-hidden px-5 pb-9 pt-5 lg:max-w-none lg:overflow-y-auto lg:pb-24">
            {children}
          </main>

          <div className="lg:hidden">
            <SiteFooter />
          </div>

          <AskFab />

          {/* 시니어용 큰 하단 탭바 */}
          <nav
            className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-background/98 backdrop-blur-xl lg:absolute"
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
            aria-label="주요 메뉴"
          >
            <ul className="mx-auto grid w-full max-w-full grid-cols-4 lg:max-w-none">
              {tabs.map((t) => {
                const active =
                  t.to === "/home"
                    ? pathname === "/home"
                    : pathname.startsWith(t.to);
                const Icon = t.icon;
                return (
                  <li key={t.to}>
                    <Link
                      to={t.to as "/home"}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex min-h-[68px] flex-col items-center justify-center gap-1 px-1 pb-2 pt-2.5 transition-colors",
                        active ? "text-primary" : "text-foreground/60",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute inset-x-6 top-0 h-1 rounded-b-full bg-primary"
                        />
                      )}
                      <Icon
                        className="h-6 w-6"
                        strokeWidth={active ? 2.4 : 1.9}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          "text-base leading-none",
                          active ? "font-bold" : "font-semibold",
                        )}
                      >
                        {t.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}
