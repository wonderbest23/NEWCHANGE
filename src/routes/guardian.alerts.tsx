import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/brand/StatusBadge";
import {
  ArrowLeft,
  AlertTriangle,
  Bell,
  Check,
  Loader2,
  Phone,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/mock-auth";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";
import {
  getGuardianAlerts,
  acknowledgeAlert,
  resolveAlert,
  dismissAlert,
  type GuardianAlertRow,
  type GuardianAlertsResult,
} from "@/server/care/guardian-alerts.functions";

export const Route = createFileRoute("/guardian/alerts")({
  ssr: false,
  beforeLoad: requireAuthBeforeLoad,
  head: () => ({
    meta: [
      { title: "이상 신호 — 곁" },
      {
        name: "description",
        content: "AI 안부 전화와 문자 응답에서 확인이 필요한 신호만 모았습니다.",
      },
    ],
  }),
  component: AlertsPage,
});

type FilterTab = "open" | "acknowledged" | "resolved" | "all";

const TABS: { value: FilterTab; label: string }[] = [
  { value: "open", label: "열림" },
  { value: "acknowledged", label: "확인함" },
  { value: "resolved", label: "해결됨" },
  { value: "all", label: "전체" },
];

const SEVERITY_LABEL: Record<string, string> = {
  critical: "바로 확인 필요",
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
  R004: "통화에서 이런 표현이 기록됐어요",
  R007: "안부전화 긴급 확인 표현",
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

function AlertsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterTab>("open");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: "/auth", search: { mode: "signin" } });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["guardian-alerts", filter],
    enabled: !authLoading && isAuthenticated,
    staleTime: 15_000,
    queryFn: () =>
      withAuth(
        getGuardianAlerts as unknown as (opts: {
          headers?: Record<string, string>;
          data?: unknown;
        }) => Promise<GuardianAlertsResult>,
        { filter },
      ),
  });

  const ackMut = useMutation({
    mutationFn: (alertId: string) =>
      withAuth(
        acknowledgeAlert as unknown as (opts: {
          headers?: Record<string, string>;
          data?: unknown;
        }) => Promise<{ ok: boolean; error?: string }>,
        { alertId },
      ),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.error ?? "처리 실패");
      toast.success("확인으로 표시했어요");
      queryClient.invalidateQueries({ queryKey: ["guardian-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["guardian-home"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveMut = useMutation({
    mutationFn: (alertId: string) =>
      withAuth(
        resolveAlert as unknown as (opts: {
          headers?: Record<string, string>;
          data?: unknown;
        }) => Promise<{ ok: boolean; error?: string }>,
        { alertId },
      ),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.error ?? "처리 실패");
      toast.success("해결됨으로 표시했어요");
      queryClient.invalidateQueries({ queryKey: ["guardian-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["guardian-home"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dismissMut = useMutation({
    mutationFn: (alertId: string) =>
      withAuth(
        dismissAlert as unknown as (opts: {
          headers?: Record<string, string>;
          data?: unknown;
        }) => Promise<{ ok: boolean; error?: string }>,
        { alertId },
      ),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.error ?? "처리 실패");
      toast.success("닫았어요");
      queryClient.invalidateQueries({ queryKey: ["guardian-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["guardian-home"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alerts = data?.alerts ?? [];
  const counts = data?.counts ?? { open: 0, acknowledged: 0, resolved: 0, total: 0 };

  return (
    <AppLayout context="guardian">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
        <Link
          to="/guardian/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 홈으로
        </Link>

        <header className="space-y-1.5">
          <p className="text-[13px] font-medium text-muted-foreground">이상 신호</p>
          <h1 className="font-display text-[26px] leading-tight tracking-tight sm:text-[30px]">
            확인 대기 {counts.open}건
          </h1>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            AI 안부 전화와 문자 응답에서 확인이 필요한 신호만 모았습니다.
          </p>
        </header>

        <div className="mt-5 flex rounded-full border border-border bg-card p-1 text-[12px]">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 transition-colors",
                filter === t.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
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
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => refetch()}
            >
              다시 시도
            </Button>
          </div>
        )}

        {!isLoading && !error && (
          <ul className="mt-5 space-y-3">
            {alerts.map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                onAck={() => ackMut.mutate(a.id)}
                onResolve={() => resolveMut.mutate(a.id)}
                onDismiss={() => dismissMut.mutate(a.id)}
                pending={
                  (ackMut.isPending && ackMut.variables === a.id) ||
                  (resolveMut.isPending && resolveMut.variables === a.id) ||
                  (dismissMut.isPending && dismissMut.variables === a.id)
                }
              />
            ))}
            {alerts.length === 0 && (
              <li className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
                <p className="text-[14px] text-muted-foreground">
                  {filter === "open"
                    ? "확인이 필요한 알림이 없어요. 평온한 하루예요. 🌿"
                    : "표시할 알림이 없어요."}
                </p>
              </li>
            )}
          </ul>
        )}

        <p className="mt-6 px-2 text-[12px] leading-relaxed text-muted-foreground">
          ⓘ 알림은 진단이 아닌 ‘재확인이 필요한 신호’입니다. 긴급이라도 자동 119 연계는
          하지 않으며, 보호자 판단이 우선합니다.
        </p>
      </div>
    </AppLayout>
  );
}

function AlertCard({
  alert,
  onAck,
  onResolve,
  onDismiss,
  pending,
}: {
  alert: GuardianAlertRow;
  onAck: () => void;
  onResolve: () => void;
  onDismiss: () => void;
  pending: boolean;
}) {
  const sevTone = SEVERITY_TONE[alert.severity] ?? "muted";
  const sevLabel = SEVERITY_LABEL[alert.severity] ?? alert.severity;
  const ruleLabel = RULE_LABEL[alert.rule_code] ?? alert.rule_code;
  const isOpen = alert.status === "open";
  const isAck = alert.status === "acknowledged";
  const isClosed = alert.status === "resolved" || alert.status === "dismissed";

  const time = new Date(alert.created_at).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const evidenceExcerpt = extractEvidenceText(alert.evidence);
  const evidenceSources = extractEvidenceSources(alert.evidence);
  const recommendedAction = extractRecommendedAction(alert.evidence);

  return (
    <li
      className={cn(
        "overflow-hidden rounded-3xl border bg-card transition-opacity",
        alert.severity === "critical" && isOpen
          ? "border-primary/40"
          : "border-border/60",
        isClosed && "opacity-60",
      )}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
              alert.severity === "critical"
                ? "bg-rose-soft text-primary"
                : alert.severity === "warning"
                  ? "bg-amber-soft text-foreground"
                  : "bg-surface text-foreground/70",
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
              {isAck && <StatusBadge tone="muted">확인함</StatusBadge>}
              {alert.status === "resolved" && (
                <StatusBadge tone="sage">해결됨</StatusBadge>
              )}
              {alert.status === "dismissed" && (
                <StatusBadge tone="muted">닫음</StatusBadge>
              )}
              <span className="text-[12px] text-muted-foreground">{time}</span>
            </div>
            <p className="mt-2 text-[15px] font-medium leading-snug text-foreground">
              {alert.guardian_message}
            </p>
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              {ruleLabel}
              {alert.recipient_name ? ` · ${alert.recipient_name}` : ""}
            </p>
            {evidenceExcerpt && (
              <div className="mt-2 rounded-xl bg-surface/60 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                <span className="text-foreground/80">기록 일부:</span>{" "}
                “{evidenceExcerpt}”
              </div>
            )}
            {alert.rule_code === "R007" && (
              <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 p-3 text-[12px] leading-relaxed">
                {recommendedAction && (
                  <p className="font-medium text-foreground">
                    {recommendedAction}
                  </p>
                )}
                {evidenceSources.length > 0 && (
                  <p className="mt-2 text-muted-foreground">
                    근거 출처: {evidenceSources.join(", ")}
                  </p>
                )}
                <p className="mt-2 text-muted-foreground">
                  이 알림은 진단이 아니라 보호자 확인이 필요한 표현을 전달하는 기록입니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {!isClosed && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-surface/40 px-4 py-3">
          {alert.severity === "critical" && isOpen && (
            <Button
              variant="hero"
              size="sm"
              className="h-8 gap-1.5 rounded-full"
              onClick={() => toast.info("부모님 번호로 직접 전화해 주세요.")}
            >
              <Phone className="h-3.5 w-3.5" /> 직접 전화
            </Button>
          )}
          {isOpen && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-full"
              disabled={pending}
              onClick={onAck}
            >
              <Check className="h-3.5 w-3.5" /> 확인했어요
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-full"
            disabled={pending}
            onClick={onResolve}
          >
            <Check className="h-3.5 w-3.5" /> 해결했어요
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 gap-1.5 rounded-full text-muted-foreground"
            disabled={pending}
            onClick={onDismiss}
          >
            <X className="h-3.5 w-3.5" /> 닫기
          </Button>
        </div>
      )}
    </li>
  );
}

function extractEvidenceText(evidence: object | null | undefined): string | null {
  if (!evidence || typeof evidence !== "object") return null;
  const e = evidence as Record<string, unknown>;
  const candidates = [
    e.raw_text_excerpt,
    e.raw_text,
    e.summary,
    e.note,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) {
      return c.length > 120 ? c.slice(0, 120) + "…" : c;
    }
  }
  return null;
}

function extractEvidenceSources(evidence: object | null | undefined): string[] {
  if (!evidence || typeof evidence !== "object") return [];
  const value = (evidence as Record<string, unknown>).evidence_sources;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function extractRecommendedAction(evidence: object | null | undefined): string | null {
  if (!evidence || typeof evidence !== "object") return null;
  const value = (evidence as Record<string, unknown>).recommended_action;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
