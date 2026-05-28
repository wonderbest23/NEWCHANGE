/**
 * /admin/asset-forge — Tripo3D 로 GLB 자산 생성·관리.
 *
 * UI:
 *  - 상단: 신규 생성 폼 (kind 드롭다운 + prompt 텍스트영역 + "생성" 버튼)
 *  - 하단: 자산 목록 카드 (썸네일 + status + actions: poll / active toggle / GLB 링크)
 *
 * 권한: 서버 fn 안에서 ADMIN_USER_IDS env 검증. 미설정 dev 면 누구나.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Power, RefreshCw, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import {
  listAssets,
  pollAsset,
  requestAsset,
  setAssetActive,
} from "@/lib/asset-forge/actions";
import { PROMPT_PRESETS, STYLE_SUFFIX } from "@/lib/asset-forge/prompts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/asset-forge")({
  component: AssetForgePage,
});

const KINDS: Array<{ value: string; label: string }> = [
  { value: "kiosk", label: "키오스크" },
  { value: "coffee_machine", label: "커피머신" },
  { value: "excavator", label: "포크레인" },
  { value: "pet", label: "강아지" },
  { value: "fish", label: "물고기" },
  { value: "monster", label: "몬스터" },
  { value: "generic", label: "기타" },
];

interface AssetRow {
  id: string;
  kind: string;
  prompt: string;
  status: string;
  tripo_task_id: string | null;
  glb_url: string | null;
  preview_url: string | null;
  active: boolean;
  error_message: string | null;
  created_at: string;
}

function AssetForgePage() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<string>("fish");
  const [prompt, setPrompt] = useState("");

  const listQ = useQuery({
    queryKey: ["asset-forge-list"],
    queryFn: async () =>
      listAssets({
        data: {},
        headers: await authHeaders(),
      } as Parameters<typeof listAssets>[0]),
    refetchOnMount: "always",
    refetchInterval: (data) => {
      // 진행 중인 게 있으면 10초마다 자동 새로고침
      const res = data.state.data;
      if (res && "ok" in res && res.ok) {
        const list = res.assets as unknown as AssetRow[];
        const running = list.some((a) => a.status === "queued" || a.status === "running");
        return running ? 10000 : false;
      }
      return false;
    },
  });

  const requestMut = useMutation({
    mutationFn: async (params: { prompt: string }) =>
      requestAsset({
        data: { kind: kind as never, prompt: params.prompt },
        headers: await authHeaders(),
      } as Parameters<typeof requestAsset>[0]),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.reason ?? "생성 실패");
        return;
      }
      toast.success("Tripo3D 작업 시작! 1~3분 소요");
      setPrompt("");
      qc.invalidateQueries({ queryKey: ["asset-forge-list"] });
    },
  });

  // 현 kind 의 모든 프리셋을 순차 생성 (Tripo rate-limit 회피 + 비용 가시화)
  const bulkMut = useMutation({
    mutationFn: async () => {
      const list = presets;
      const results: Array<{ label: string; ok: boolean; reason?: string }> = [];
      for (const p of list) {
        try {
          const res = await requestAsset({
            data: { kind: kind as never, prompt: p.prompt },
            headers: await authHeaders(),
          } as Parameters<typeof requestAsset>[0]);
          results.push({ label: p.label, ok: res.ok, reason: res.ok ? undefined : res.reason });
        } catch (e) {
          results.push({
            label: p.label,
            ok: false,
            reason: e instanceof Error ? e.message : String(e),
          });
        }
        // 250ms 간격 — Tripo API rate-limit 회피
        await new Promise((r) => setTimeout(r, 250));
      }
      return results;
    },
    onSuccess: (results) => {
      const okCount = results.filter((r) => r.ok).length;
      toast.success(`${okCount} / ${results.length}개 생성 시작 완료`);
      qc.invalidateQueries({ queryKey: ["asset-forge-list"] });
    },
  });

  const pollMut = useMutation({
    mutationFn: async (asset_id: string) =>
      pollAsset({
        data: { asset_id },
        headers: await authHeaders(),
      } as Parameters<typeof pollAsset>[0]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-forge-list"] }),
  });

  const activeMut = useMutation({
    mutationFn: async (params: { asset_id: string; active: boolean }) =>
      setAssetActive({
        data: params,
        headers: await authHeaders(),
      } as Parameters<typeof setAssetActive>[0]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-forge-list"] }),
  });

  const list = listQ.data && "ok" in listQ.data && listQ.data.ok
    ? (listQ.data.assets as unknown as AssetRow[])
    : [];
  const notAdmin =
    listQ.data && "ok" in listQ.data && !listQ.data.ok && listQ.data.reason === "not_admin";

  const presets = PROMPT_PRESETS[kind] ?? [];

  // 로컬 dev / 빠른 검증용 — 진행 중인 자산이 보이면 자동으로 각각 poll 발사.
  // production 에서는 cron 이 같은 일을 하지만, 로컬에선 페이지 켜둔 동안 자동 진행.
  const runningIds = list
    .filter((a) => a.status === "queued" || a.status === "running")
    .map((a) => a.id);
  const runningKey = runningIds.join(",");
  useEffect(() => {
    if (runningIds.length === 0) return;
    const t = setInterval(() => {
      runningIds.forEach((id) => pollMut.mutate(id));
    }, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningKey]);

  if (notAdmin) {
    const yourId =
      listQ.data && "your_user_id" in listQ.data
        ? (listQ.data as { your_user_id?: string }).your_user_id
        : undefined;
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-foreground/80">관리자 권한이 필요합니다.</p>
        <p className="mt-4 text-xs text-foreground/55">
          아래 ID를 Cloudflare 환경변수 <code>ADMIN_USER_IDS</code> 에 추가하세요.
        </p>
        {yourId && (
          <>
            <div className="mt-4 break-all rounded-lg border border-border bg-muted/40 p-3 text-left font-mono text-xs">
              {yourId}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                navigator.clipboard?.writeText(yourId).catch(() => null);
                toast.success("복사됨");
              }}
            >
              복사
            </Button>
            <p className="mt-6 text-[11px] leading-relaxed text-foreground/55">
              터미널에서:
              <br />
              <code className="break-all">
                echo "{yourId}" | npx wrangler secret put ADMIN_USER_IDS
              </code>
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-24">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Admin</p>
        <h1 className="font-display text-2xl">Asset Forge</h1>
        <p className="mt-1 text-sm text-foreground/65">
          Tripo3D 로 GLB 모델 자동 생성. 시나리오는 active=true 인 최신 모델을 자동 로드.
        </p>
      </header>

      {/* 신규 생성 폼 */}
      <Card className="space-y-3 p-4">
        <label className="block text-xs font-medium">종류</label>
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPrompt(""); // 종류 바뀌면 프롬프트도 리셋
          }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>

        {/* 프리셋 칩 — 클릭하면 textarea 채움 */}
        {presets.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium">
              프리셋 ({presets.length}개) — 클릭해서 채우기
            </label>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPrompt(p.prompt)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] transition active:scale-95",
                    prompt === p.prompt
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="block text-xs font-medium">프롬프트 (영문 권장)</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={presets[0]?.prompt ?? "단일 오브젝트 영문 설명"}
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <p className="text-[10px] leading-relaxed text-foreground/55">
          자동 적용 suffix: <code className="break-words">{STYLE_SUFFIX}</code>
        </p>

        <div className="flex gap-2">
          <Button
            size="lg"
            className="flex-1 gap-2"
            disabled={requestMut.isPending || prompt.trim().length < 3}
            onClick={() => requestMut.mutate({ prompt: prompt.trim() })}
          >
            {requestMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            1개 생성
          </Button>
          {presets.length > 0 && (
            <Button
              size="lg"
              variant="outline"
              className="gap-2"
              disabled={bulkMut.isPending}
              onClick={() => bulkMut.mutate()}
              title={`${presets.length}개 프리셋 모두 생성`}
            >
              {bulkMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>전체 {presets.length}개</>
              )}
            </Button>
          )}
        </div>
        <p className="text-[10px] text-amber-700">
          ⚠ Tripo3D 크레딧이 소비됩니다. "전체" 버튼은 신중히.
        </p>
      </Card>

      {/* 자산 목록 */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="font-display text-lg">생성된 자산 ({list.length})</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["asset-forge-list"] })}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            새로고침
          </Button>
        </header>

        {listQ.isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        <div className="space-y-2">
          {list.map((a) => (
            <Card key={a.id} className="flex gap-3 p-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                {a.preview_url ? (
                  <img src={a.preview_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-foreground/40">
                    no preview
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">
                    {a.kind}
                  </span>
                  <StatusBadge status={a.status} />
                  {a.active && (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-xs text-foreground/70">{a.prompt}</p>
                {a.error_message && (
                  <p className="text-[10px] text-rose-600">⚠ {a.error_message}</p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {(a.status === "queued" || a.status === "running") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={pollMut.isPending}
                      onClick={() => pollMut.mutate(a.id)}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      상태 새로고침
                    </Button>
                  )}
                  {a.status === "success" && (
                    <>
                      <Button
                        size="sm"
                        variant={a.active ? "outline" : "default"}
                        className="h-7 text-[11px]"
                        onClick={() =>
                          activeMut.mutate({ asset_id: a.id, active: !a.active })
                        }
                      >
                        <Power className="mr-1 h-3 w-3" />
                        {a.active ? "비활성" : "활성"}
                      </Button>
                      {a.glb_url && (
                        <a
                          href={a.glb_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] hover:bg-muted"
                        >
                          GLB
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
          {!listQ.isLoading && list.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-foreground/55">
              아직 생성된 자산이 없어요. 위에서 새 모델을 만들어 보세요.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "bg-amber-200 text-amber-900",
    running: "bg-sky-200 text-sky-900",
    success: "bg-emerald-200 text-emerald-900",
    failed: "bg-rose-200 text-rose-900",
    expired: "bg-zinc-200 text-zinc-700",
  };
  const labelMap: Record<string, string> = {
    queued: "대기",
    running: "생성 중",
    success: "완료",
    failed: "실패",
    expired: "만료",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold",
        map[status] ?? "bg-zinc-200 text-zinc-700",
      )}
    >
      {labelMap[status] ?? status}
    </span>
  );
}
