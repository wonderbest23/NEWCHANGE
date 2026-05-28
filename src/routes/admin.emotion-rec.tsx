import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import {
  adminEmotionRecFeedbackStats,
  adminListEmotionRecFeedback,
  type EmotionRecFeedbackRow,
  type EmotionRecFeedbackStats,
} from "@/server/admin/emotion-rec.functions";
import { Heart, Lock, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/emotion-rec")({
  head: () => ({ meta: [{ title: "감정 권고 피드백 — 곁 운영" }] }),
  component: AdminEmotionRecPage,
});

const EMOTION_LABEL: Record<string, string> = {
  joyful: "밝고 좋아요",
  calm: "평온해요",
  sad: "마음이 가라앉아요",
  tired: "지쳐 보여요",
  alert: "긴장된 느낌",
  anxious: "걱정이 느껴져요",
};

function AdminEmotionRecPage() {
  const { loading } = useAuth();
  const { data: appState, isLoading: appStateLoading } = useAppState();
  const isAdmin = appState?.role === "admin";
  const [stats, setStats] = useState<EmotionRecFeedbackStats | null>(null);
  const [rows, setRows] = useState<EmotionRecFeedbackRow[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    adminEmotionRecFeedbackStats()
      .then(setStats)
      .catch((e) => toast.error(e instanceof Error ? e.message : "통계 불러오기 실패"));
    adminListEmotionRecFeedback({ data: { limit: 80 } })
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "목록 불러오기 실패"));
  }, [isAdmin]);

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

  const helpfulRate =
    stats && stats.total > 0 ? Math.round((stats.helpful / stats.total) * 100) : null;

  return (
    <AdminLayout>
      <header>
        <p className="text-sm text-muted-foreground">콘텐츠 관리</p>
        <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
          감정 권고 피드백
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          시니어가 「감정 기반 권고 모음」에 남긴 도움 됨/안 됨 의견
        </p>
      </header>

      {stats && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="전체 의견" value={stats.total} icon={Heart} />
          <StatCard label="도움 됐어요" value={stats.helpful} icon={ThumbsUp} tone="text-sage" />
          <StatCard label="아니오" value={stats.notHelpful} icon={ThumbsDown} tone="text-amber-warm" />
          <StatCard
            label="긍정 비율"
            value={helpfulRate !== null ? `${helpfulRate}%` : "—"}
            icon={Heart}
          />
        </div>
      )}

      {stats && Object.keys(stats.byEmotion).length > 0 && (
        <div className="mt-6 rounded-2xl border border-border/60 bg-card p-5">
          <p className="text-sm font-semibold text-muted-foreground">감정별 피드백 수</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {Object.entries(stats.byEmotion)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => (
                <li
                  key={key}
                  className="rounded-full border border-border/60 bg-surface px-3 py-1 text-sm"
                >
                  {EMOTION_LABEL[key] ?? key}{" "}
                  <span className="font-bold tabular-nums text-foreground">{count}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-2xl border border-border/60 bg-card">
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="font-display text-lg">최근 피드백</h2>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            아직 피드백이 없어요. 시니어가 통화 완료 후 권고 모음에서 의견을 남기면 여기에 표시됩니다.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((row) => (
              <li key={row.id} className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      row.helpful
                        ? "rounded-full bg-sage/15 px-2 py-0.5 text-xs font-bold text-sage"
                        : "rounded-full bg-amber-warm/15 px-2 py-0.5 text-xs font-bold text-amber-warm"
                    }
                  >
                    {row.helpful ? "도움 됨" : "아니오"}
                  </span>
                  <span className="text-foreground/80">
                    {EMOTION_LABEL[row.emotion_key] ?? row.emotion_key}
                  </span>
                  {row.source && (
                    <span className="text-xs text-muted-foreground">출처: {row.source}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                  {row.cache_key ? ` · ${row.cache_key}` : ""}
                </p>
                {row.comment && (
                  <p className="mt-2 rounded-lg bg-surface/80 px-3 py-2 text-sm text-foreground/85">
                    {row.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminLayout>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: typeof Heart;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`mt-2 font-display text-3xl font-bold tabular-nums ${tone ?? "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
