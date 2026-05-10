import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/brand/StatusBadge";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import { runIngestTask, listIngestRuns } from "@/server/ingest/ingest.functions";
import { Lock, Play, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";

async function authHeaders() {
  const { data } = await getSessionCached();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다");
  return { Authorization: `Bearer ${token}` };
}

export const Route = createFileRoute("/admin/ingest")({
  head: () => ({
    meta: [
      { title: "로컬 데이터 수집기 — 곁 운영" },
      { name: "description", content: "지역 자원 수집기를 수동으로 실행하고 최근 실행 결과를 확인합니다." },
    ],
  }),
  component: IngestAdminPage,
});

type Task = "welfare" | "events" | "rss" | "embeddings" | "all";

const TASKS: { key: Task; label: string; description: string }[] = [
  { key: "all", label: "전체 실행", description: "복지시설 + 행사 + RSS + 임베딩을 한 번에 실행합니다." },
  { key: "welfare", label: "복지시설", description: "서울 OpenAPI에서 복지관/경로당을 가져옵니다." },
  { key: "events", label: "공공예약/행사", description: "서울 공공서비스예약 행사를 가져옵니다." },
  { key: "rss", label: "자치구 RSS", description: "25개 자치구 공지 RSS를 크롤링합니다." },
  { key: "embeddings", label: "임베딩 백필", description: "신규 자원 50건의 벡터 임베딩을 생성합니다." },
];

type Run = {
  id: string;
  source_name: string;
  district: string | null;
  status: string;
  inserted_count: number;
  updated_count: number;
  error_count: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

function IngestAdminPage() {
  const { loading } = useAuth();
  const { data: appState, isLoading: appStateLoading } = useAppState();
  const isAdmin = appState?.role === "admin";

  const [running, setRunning] = useState<Task | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const refresh = async () => {
    setLoadingRuns(true);
    try {
      const headers = await authHeaders();
      const res = await listIngestRuns({ headers } as Parameters<typeof listIngestRuns>[0]);
      setRuns((res.runs ?? []) as Run[]);
    } catch (e) {
      toast.error(`실행 결과 조회 실패: ${String(e)}`);
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin]);

  const trigger = async (task: Task) => {
    setRunning(task);
    try {
      const headers = await authHeaders();
      const res = await runIngestTask({ data: { task }, headers } as Parameters<typeof runIngestTask>[0]);
      if (res.ok) toast.success(`수집 완료 (${task})`);
      else toast.error(`수집 실패: ${res.error ?? "알 수 없는 오류"}`);
    } catch (e) {
      toast.error(`실행 실패: ${String(e)}`);
    } finally {
      setRunning(null);
      refresh();
    }
  };

  if (loading || appStateLoading) return null;

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-md rounded-3xl border border-border/60 bg-card p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-soft">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-4 font-display text-2xl">관리자 전용</h1>
          <p className="mt-2 text-sm text-muted-foreground">어드민 권한이 필요합니다.</p>
          <Button asChild variant="hero" className="mt-5 rounded-full">
            <Link to="/auth">로그인</Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">관리자 · 데이터 운영</p>
          <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">로컬 데이터 수집기</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            지역 자원 수집 작업을 수동으로 실행하고 최근 실행 이력을 확인합니다.
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loadingRuns} className="rounded-full">
          <RefreshCw className={`mr-2 h-4 w-4 ${loadingRuns ? "animate-spin" : ""}`} /> 새로고침
        </Button>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TASKS.map((t) => (
          <div key={t.key} className="rounded-3xl border border-border/60 bg-card p-6">
            <h3 className="font-display text-lg text-foreground">{t.label}</h3>
            <p className="mt-2 min-h-[3rem] text-sm text-muted-foreground">{t.description}</p>
            <Button
              variant={t.key === "all" ? "hero" : "secondary"}
              className="mt-4 w-full rounded-full"
              disabled={running !== null}
              onClick={() => trigger(t.key)}
            >
              {running === t.key ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 실행 중…</>
              ) : (
                <><Play className="mr-2 h-4 w-4" /> 실행</>
              )}
            </Button>
          </div>
        ))}
      </section>

      <section className="mt-10 rounded-3xl border border-border/60 bg-card p-6">
        <header className="flex items-center justify-between">
          <h2 className="font-display text-xl text-foreground">최근 실행 결과</h2>
          <span className="text-xs text-muted-foreground">최근 50건</span>
        </header>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">소스</th>
                <th className="px-4 py-3 font-medium">자치구</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium text-right">추가</th>
                <th className="px-4 py-3 font-medium text-right">갱신</th>
                <th className="px-4 py-3 font-medium text-right">오류</th>
                <th className="px-4 py-3 font-medium">시각</th>
                <th className="px-4 py-3 font-medium">메시지</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    아직 실행 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                runs.map((r) => {
                  const ok = r.status === "success" || r.status === "ok" || r.error_count === 0;
                  return (
                    <tr key={r.id} className="bg-card">
                      <td className="px-4 py-3 font-medium text-foreground">{r.source_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.district ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={ok ? "sage" : "amber"} dot>
                          {ok ? "성공" : "실패"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.inserted_count}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.updated_count}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.error_count}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(r.started_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-3 text-xs text-muted-foreground" title={r.error_message ?? ""}>
                        {r.error_message ?? "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}
