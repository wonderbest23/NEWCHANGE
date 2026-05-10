import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell,
  ChevronDown,
  HeartPulse,
  Home,
  LogOut,
  Pill,
  Settings,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/mock-auth";

interface AppLayoutProps {
  children: React.ReactNode;
  context: "guardian" | "partner";
}

const navByContext = {
  guardian: [
    { to: "/guardian/dashboard", label: "홈", icon: Home },
    { to: "/guardian/check-in", label: "안부", icon: HeartPulse },
    { to: "/guardian/medications", label: "약", icon: Pill },
    { to: "/guardian/alerts", label: "알림함", icon: Bell },
  ],
  partner: [
    { to: "/partner/tasks", label: "업무", icon: Home },
  ],
} as const;

const labelByContext = {
  guardian: "보호자",
  partner: "돌봄 파트너",
};

export function AppLayout({ children, context }: AppLayoutProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const nav = navByContext[context];

  return (
    <div className="flex min-h-screen flex-col bg-surface pb-20 md:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
      >
        본문으로 건너뛰기
      </a>

      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="hidden h-5 w-px bg-border sm:block" />
            <span className="hidden text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground sm:inline">
              {labelByContext[context]}
            </span>
          </div>

          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "text-foreground/70 hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full border border-border bg-background px-1.5 py-1 pr-3 text-sm transition-colors hover:bg-accent">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-soft text-primary">
                    <User className="h-4 w-4" />
                  </span>
                  <span className="hidden sm:inline">내 계정</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>계정</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {context === "guardian" && (
                  <DropdownMenuItem asChild>
                    <Link to="/guardian/settings">
                      <Users className="mr-2 h-4 w-4" /> 함께 관리 · 가족
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" /> 설정
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async (e) => {
                    e.preventDefault();
                    await signOut();
                    navigate({ to: "/" });
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" /> 로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>

      {/* Mobile bottom nav */}
      {context === "guardian" && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl md:hidden">
          <ul className="mx-auto grid max-w-md grid-cols-4">
            {nav.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                        active ? "bg-foreground text-background" : "",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
