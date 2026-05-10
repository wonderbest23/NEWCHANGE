import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/brand/StatusBadge";
import {
  AlertTriangle,
  Bell,
  Check,
  Loader2,
  Lock,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";
import {
  getAdminAlerts,
  adminChangeAlertStatus,
  type AdminAlertRow,
  type AdminAlertsResult,
} from "@/server/admin/alerts.functions";

export const Route = createFileRoute("/admin/alerts")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "주의 신호 운영 — 곁" },
      { name: "description", content: "관리자 전용 주의 신호 목록 및 조치 화면." },
    ],
  }),
  component: AdminAlertsPage,
});

type StatusTab = "open" | "acknowledged" | "resolved" | "all";
type SeverityTab = "all" | "critical" | "warning" | "info";

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "open", label: "열림" },
  { value: "acknowledged", label: "확인함" },
  { value: "resolved", label: "해결됨" },
  { value: "all", label: "전체" },
];

const SEVERITY_TABS: { value: SeverityTab; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "critical", label: "긴급" },
  { value: "warning", label: "주의" },
  { value: "info", label: "참고" },
];

const SEVERITY_LABEL: Record<string, string> = {
  critical: "긴급",
  warning: "주의",
  info: "참고",
};
const SEVERITY_TONE: Record<string, "rose" | "amber" | "muted"> = {
  critical: "rose",
  warning: "amber",
  info: "muted",
};

const RULE_LABEL: Record<string, string> = {
  R001: "최근 통화 응답 없음",
  R002: "식사 미확인 반복",
  R003: "복약 미확인 반복",
  R004: "통화 중 위험 표현",
  R005: "응급 vital",
  R006: "정서 위험 신호",
};

async function withAuth<T>(
  fn: (opts: { headers?: Record<string, string>; data?: unknown }) => Promise<T>,
  data?: unknown,
): Promise<T> {
  const { data: session } = await getSessionCached();
  const token = session.session?.access_token;
  return fn({
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    ...(data !== undefined ? { data } : {}),
  });
}

function AdminAlertsPage() {
  const { user, loading } = useAuth();
  const { data: appState, isLoading: appStateLoading } = useAppState();
  const navigate = useNavigate();
  const isAdmin = appState?.role === "admin";

  const [status, setStatus] = useState<StatusTab>("open");
  const [severity, setSeverity] = useState<SeverityTab>("all");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { mode: "signin" } });
  }, [loading, user, navigate]);

  // Supabase Realtime: anomaly_alerts 변경 시 목록 즉시 갱신 + 자동 재연결
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "reconnecting" | "error">(
    "connecting",
  );
  useEffect(() => {
    if (!isAdmin) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let cancelled = false;
    // 최초 연결인지 / 재연결인지 구분 (토스트 메시지용)
    let hasConnectedOnce = false;

    const connect = () => {
      if (cancelled) return;
      channel = supabase
        .channel("admin-alerts-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "anomaly_alerts" },
          () => {
            queryClient.invalidateQueries({ queryKey: ["admin-alerts"] });
          },
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            attempt = 0;
            setLiveStatus("live");
            if (hasConnectedOnce) {
              toast.success("실시간 연결이 복구되었어요");
              queryClient.invalidateQueries({ queryKey: ["admin-alerts"] });
            } else {
              toast.success("실시간 연결됨");
            }
            hasConnectedOnce = true;
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            const isError = status === "CHANNEL_ERROR";
            setLiveStatus(isError ? "error" : "reconnecting");
            if (attempt === 0) {
              if (isError) toast.error("실시간 연결 오류 — 재시도 중");
              else if (hasConnectedOnce) toast.message("연결이 끊겨 재연결 중…");
            }
            // 지수 백오프 (1s → 30s)
            const delay = Math.min(30_000, 1_000 * Math.pow(2, attempt));
            attempt += 1;
            if (channel) {
              supabase.removeChannel(channel);
              channel = null;
            }
            retryTimer = setTimeout(connect, delay);
          }
        });
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [isAdmin, queryClient]);
  const isLive = liveStatus === "live";

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin-alerts", status, severity],
    enabled: isAdmin,
    staleTime: 15_000,
    queryFn: () =>
      withAuth(
        getAdminAlerts as unknown as (opts: {
          headers?: Record<string, string>;
          data?: unknown;
        }) => Promise<AdminAlertsResult>,
        { status, severity },
      ),
  });

  const actionMut = useMutation({
    mutationFn: (vars: { alertId: string; action: "acknowledge" | "resolve" | "dismiss" }) =>
      withAuth(
        adminChangeAlertStatus as unknown as (opts: {
          headers?: Record<string, string>;
          data?: unknown;
        }) => Promise<{ ok: boolean; error?: string }>,
        vars,
      ),
    onSuccess: (res, vars) => {
      if (!res.ok) return toast.error(res.error ?? "처리 실패");
      toast.success(
        vars.action === "acknowledge"
          ? "확인으로 표시했어요"
          : vars.action === "resolve"
            ? "해결됨으로 표시했어요"
            : "닫았어요",
      );
      queryClient.invalidateQueries({ queryKey: ["admin-alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading || appStateLoading) {
    return (
      <AdminLayout>
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          불러오는 중…
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 font-display text-xl">관리자 전용</h1>
          <p className="mt-1 text-sm text-muted-foreground">접근 권한이 없습니다.</p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/">홈으로</Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const alerts = data?.alerts ?? [];
  const counts = data?.counts ?? { open: 0, acknowledged: 0, resolved: 0, total: 0 };
  const bySev = data?.bySeverity ?? { critical: 0, warning: 0, info: 0 };

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              운영
            </p>
            <h1 className="font-display text-3xl tracking-tight">주의 신호</h1>
            <p className="text-sm text-muted-foreground">
              전체 어르신의 이상 신호를 한 화면에서 확인하고 조치합니다.
            </p>
          </div>
          <StatusBadge
            tone={isLive ? "sage" : liveStatus === "error" ? "rose" : "muted"}
            dot={isLive}
          >
            {liveStatus === "live"
              ? "실시간"
              : liveStatus === "reconnecting"
                ? "재연결 중"
                : liveStatus === "error"
                  ? "연결 오류"
                  : "연결 중"}
          </StatusBadge>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="열림" value={counts.open} accent="primary" />
          <SummaryCard label="긴급(열림)" value={bySev.critical} accent="rose" />
          <SummaryCard label="주의(열림)" value={bySev.warning} accent="amber" />
          <SummaryCard label="누적" value={counts.total} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <div className="flex rounded-full border border-border bg-card p-1 text-xs">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setStatus(t.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 transition-colors",
                  status === t.value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-full border border-border bg-card p-1 text-xs">
            {SEVERITY_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setSeverity(t.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 transition-colors",
                  severity === t.value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {(isLoading || isFetching) && (
          <div className="mt-6 flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-3xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            <p className="font-medium">알림을 불러오지 못했어요.</p>
            <p className="mt-1 text-xs break-words">{(error as Error).message}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => refetch()}>
              다시 시도
            </Button>
          </div>
        )}

        {!isLoading && !error && (
          <ul className="mt-5 space-y-3">
            {alerts.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                onAction={(action) => actionMut.mutate({ alertId: a.id, action })}
                pending={actionMut.isPending && actionMut.variables?.alertId === a.id}
              />
            ))}
            {alerts.length === 0 && (
              <li className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
                표시할 알림이 없어요.
              </li>
            )}
          </ul>
        )}
      </div>
    </AdminLayout>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "primary" | "rose" | "amber";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-display text-2xl tabular-nums",
          accent === "primary" && "text-primary",
          accent === "rose" && "text-rose-400",
          accent === "amber" && "text-amber-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function AlertRow({
  alert,
  onAction,
  pending,
}: {
  alert: AdminAlertRow;
  onAction: (a: "acknowledge" | "resolve" | "dismiss") => void;
  pending: boolean;
}) {
  const sevTone = SEVERITY_TONE[alert.severity] ?? "muted";
  const sevLabel = SEVERITY_LABEL[alert.severity] ?? alert.severity;
  const ruleLabel = RULE_LABEL[alert.rule_code] ?? alert.rule_code;
  const isOpen = alert.status === "open";
  const isClosed = alert.status === "resolved" || alert.status === "dismissed";
  const time = new Date(alert.created_at).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const excerpt = extractEvidenceText(alert.evidence);

  return (
    <li
      className={cn(
        "overflow-hidden rounded-3xl border bg-card transition-opacity",
        alert.severity === "critical" && isOpen ? "border-primary/40" : "border-border/60",
        isClosed && "opacity-60",
      )}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
              alert.severity === "critical"
                ? "bg-rose-500/15 text-rose-400"
                : alert.severity === "warning"
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {alert.severity === "critical" ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={sevTone} dot={isOpen}>
                {sevLabel}
              </StatusBadge>
              {alert.status === "acknowledged" && <StatusBadge tone="muted">확인함</StatusBadge>}
              {alert.status === "resolved" && <StatusBadge tone="sage">해결됨</StatusBadge>}
              {alert.status === "dismissed" && <StatusBadge tone="muted">닫음</StatusBadge>}
              <span className="text-xs text-muted-foreground">{time}</span>
            </div>
            <p className="mt-2 text-[15px] font-medium leading-snug text-foreground">
              {alert.guardian_message}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {ruleLabel}
              {alert.recipient_name ? ` · ${alert.recipient_name}` : ""}
            </p>
            {excerpt && (
              <div className="mt-2 rounded-xl bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                <span className="text-foreground/80">기록:</span> “{excerpt}”
              </div>
            )}
          </div>
        </div>
      </div>

      {!isClosed && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/20 px-4 py-3">
          {isOpen && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-full"
              disabled={pending}
              onClick={() => onAction("acknowledge")}
            >
              <Check className="h-3.5 w-3.5" /> 확인
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-full"
            disabled={pending}
            onClick={() => onAction("resolve")}
          >
            <Check className="h-3.5 w-3.5" /> 해결
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 gap-1.5 rounded-full text-muted-foreground"
            disabled={pending}
            onClick={() => onAction("dismiss")}
          >
            <X className="h-3.5 w-3.5" /> 닫기
          </Button>
        </div>
      )}
    </li>
  );
}

function extractEvidenceText(evidence: Record<string, never> | null | undefined): string | null {
  if (!evidence || typeof evidence !== "object") return null;
  const e = evidence as unknown as Record<string, unknown>;
  const candidates = [e.raw_text_excerpt, e.raw_text, e.summary, e.note];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) {
      return c.length > 140 ? c.slice(0, 140) + "…" : c;
    }
  }
  return null;
}
