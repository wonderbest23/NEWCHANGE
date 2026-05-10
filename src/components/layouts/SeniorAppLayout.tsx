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
    <div className="flex min-h-screen flex-col bg-warm-gradient pb-32">
      <header className="sticky top-0 z-40 border-b-2 border-border/70 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between px-5">
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

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-10 pt-6">
        {children}
      </main>

      <SiteFooter />

      <AskFab />

      {/* 시니어용 큰 하단 탭바 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-background/98 backdrop-blur-xl"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        aria-label="주요 메뉴"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-4">
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
                    "relative flex min-h-[72px] flex-col items-center justify-center gap-1.5 px-1 pb-2 pt-2.5 transition-colors",
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
                    className="h-7 w-7"
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
  );
}
