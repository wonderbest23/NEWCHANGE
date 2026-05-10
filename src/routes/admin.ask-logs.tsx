import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import { adminListAskLogs, adminAskLogStats, type AskLogRow } from "@/server/ask/admin.functions";
import { Lock, MessageSquare, ShieldAlert, Stethoscope, Scale, Banknote } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/ask-logs")({
  head: () => ({ meta: [{ title: "AI 질문 로그 — 곁 운영" }] }),
  component: AdminAskLogsPage,
});

const RISK_TABS = [
  { key: "all", label: "전체" },
  { key: "medical", label: "의료" },
  { key: "legal", label: "법률" },
  { key: "finance", label: "금융 거래" },
  { key: "none", label: "일반" },
] as const;

type RiskKey = (typeof RISK_TABS)[number]["key"];

const RISK_META: Record<string, { label: string; icon: typeof Stethoscope; tone: string }> = {
  medical: { label: "의료", icon: Stethoscope, tone: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200" },
  legal: { label: "법률", icon: Scale, tone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200" },
  finance: { label: "금융 거래", icon: Banknote, tone: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" },
};

function AdminAskLogsPage() {
  const { loading } = useAuth();
  const { data: appState, isLoading: appStateLoading } = useAppState();
  const isAdmin = appState?.role === "admin";
  const [risk, setRisk] = useState<RiskKey>("all");
  const [rows, setRows] = useState<AskLogRow[]>([]);
  const [stats, setStats] = useState<{ total: number; medical: number; legal: number; finance: number; none: number } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    adminAskLogStats().then(setStats).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    adminListAskLogs({ data: { risk, limit: 100 } })
      .then((r) => setRows(r))
      .catch((e) => toast.error(e instanceof Error ? e.message : "불러오기 실패"));
  }, [isAdmin, risk]);

  if (loading || appStateLoading) return null;

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-md rounded-3xl border border-border/60 bg-card p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-soft">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-4 font-display text-2xl">관리자 전용</h1>
          <Button asChild variant="hero" className="mt-5 rounded-full">
            <Link to="/auth">로그인</Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <header>
        <p className="text-sm text-muted-foreground">콘텐츠 관리</p>
        <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
          AI 질문 로그
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          시니어가 음성으로 물어본 모든 질문과 위험 분류 내역
        </p>
      </header>

      {stats && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "전체", value: stats.total, icon: MessageSquare },
            { label: "의료", value: stats.medical, icon: Stethoscope },
            { label: "법률", value: stats.legal, icon: Scale },
            { label: "금융 거래", value: stats.finance, icon: Banknote },
            { label: "일반", value: stats.none, icon: ShieldAlert },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <s.icon className="h-3.5 w-3.5" /> {s.label}
              </div>
              <p className="mt-1 font-display text-2xl">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {RISK_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setRisk(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              risk === t.key
                ? "bg-primary text-primary-foreground"
                : "border border-border/60 bg-card text-foreground/70 hover:bg-accent/50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="mt-6">
        {rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/60 bg-card p-12 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 font-medium">표시할 질문이 없어요</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => {
              const meta = r.risk_category ? RISK_META[r.risk_category] : null;
              return (
                <li
                  key={r.id}
                  className="rounded-3xl border border-border/60 bg-card p-5"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <time>{new Date(r.created_at).toLocaleString("ko-KR")}</time>
                    {meta && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${meta.tone}`}>
                        <meta.icon className="h-3 w-3" /> {meta.label} 우선 안내
                      </span>
                    )}
                    <span className="text-muted-foreground/70">
                      {r.user_id ? `사용자 ${r.user_id.slice(0, 8)}…` : "비로그인"}
                    </span>
                  </div>
                  <p className="mt-2 text-base font-medium text-foreground">
                    Q. {r.question}
                  </p>
                  {r.answer_title && (
                    <div className="mt-3 rounded-2xl bg-surface/60 p-3 text-sm">
                      <p className="font-semibold text-foreground/90">
                        A. {r.answer_title}
                      </p>
                      {r.answer_summary && (
                        <p className="mt-1 text-foreground/70">{r.answer_summary}</p>
                      )}
                      {r.caution && (
                        <p className="mt-2 text-amber-700 dark:text-amber-300">
                          ⚠ {r.caution}
                        </p>
                      )}
                    </div>
                  )}
                  {r.related_tip_ids.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      추천된 꿀팁 {r.related_tip_ids.length}개
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AdminLayout>
  );
}
