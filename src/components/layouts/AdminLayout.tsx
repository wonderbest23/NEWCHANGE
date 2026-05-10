import { Link, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { LayoutDashboard, BarChart3, Building2, Mic, Store, AlertTriangle, Lightbulb, MessageSquare, Settings2 } from "lucide-react";
import { SiteFooter } from "@/components/layouts/SiteFooter";

const nav = [
  { to: "/admin", label: "개요", icon: LayoutDashboard },
  { to: "/admin/alerts", label: "주의 신호", icon: AlertTriangle },
  { to: "/admin/tips", label: "꿀팁", icon: Lightbulb },
  { to: "/admin/ask-logs", label: "AI 질문 로그", icon: MessageSquare },
  { to: "/admin/investor-kpi", label: "투자 지표 KPI", icon: BarChart3 },
  { to: "/admin/organization-pipeline", label: "기관 파이프라인", icon: Building2 },
  { to: "/admin/agencies", label: "대행업체 관리", icon: Store },
  { to: "/admin/voice-test", label: "음성 시뮬레이션", icon: Mic },
  { to: "/admin/site-config", label: "사이트 설정", icon: Settings2 },
] as const;

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="dark flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 border-r border-border/60 bg-surface px-4 py-6 md:block">
        <div className="px-2">
          <Logo size="sm" invert />
          <p className="mt-1 px-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">관리자</p>
        </div>
        <nav className="mt-8 flex flex-col gap-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <main className="flex-1 px-6 py-8 md:px-10 md:py-10">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
