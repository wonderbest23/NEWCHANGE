import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";
import { AppLayout } from "@/components/layouts/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, PhoneCall, ShieldCheck, Users } from "lucide-react";
import {
  getCareOverview,
  type AnomalyAlertRow,
  type CallSessionRow,
  type CareRecipientRow,
  type CareOverview,
} from "@/server/care/dashboard.functions";
import { SimulatorPanel } from "@/components/care/SimulatorPanel";
import { QuickSetupPanel } from "@/components/care/QuickSetupPanel";
import { useAuth } from "@/lib/auth/mock-auth";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";

export const Route = createFileRoute("/care/")({
  ssr: false,
  beforeLoad: requireAuthBeforeLoad,
  head: () => ({
    meta: [
      { title: "Care 대시보드 — 곁" },
      {
        name: "description",
        content: "안부 통화·이상징후 알림 운영 대시보드 (내부용 / 파일럿).",
      },
    ],
  }),
  component: CareDashboardPage,
});

function CareDashboardPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [data, setData] = useState<CareOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSessionCached()
      .then(({ data: { session } }) => {
        const token = session?.access_token;
        if (!token) throw new Error("로그인이 필요합니다");
        return getCareOverview({ headers: { Authorization: `Bearer ${token}` } });
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "불러오기 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  if (authLoading) {
    return (
      <AppLayout context="guardian">
        <div className="py-16 text-center text-sm text-muted-foreground">로그인 확인 중…</div>
      </AppLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppLayout context="guardian">
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="font-display text-xl">로그인이 필요합니다</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Care 대시보드는 보호자 로그인 후 이용할 수 있습니다.
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link to="/auth">로그인 하러 가기</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (loading || !data) {
    return (
      <AppLayout context="guardian">
        <div className="py-16 text-center text-sm text-muted-foreground">
          {error ? `오류: ${error}` : "대시보드를 불러오는 중…"}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout context="guardian">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Care · 운영 대시보드
          </p>
          <h1 className="font-display text-[26px] leading-tight tracking-tight sm:text-[30px]">
            오늘의 안부 운영

          </h1>
        </div>
        <Badge variant="outline" className="self-start sm:self-auto">
          내부 파일럿 단계
        </Badge>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={<Users className="h-4 w-4" />}
          label="등록된 어르신"
          value={data.totals.recipients}
        />
        <SummaryCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="열린 알림"
          value={data.totals.open_alerts}
          tone={data.totals.open_alerts > 0 ? "warning" : "default"}
        />
        <SummaryCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="긴급(critical) 열림"
          value={data.totals.critical_open}
          tone={data.totals.critical_open > 0 ? "danger" : "default"}
        />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">열린 이상징후 알림</CardTitle>
          </CardHeader>
          <CardContent>
            <AlertList alerts={data.openAlerts} recipients={data.recipients} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">최근 통화 세션</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionList sessions={data.recentSessions} recipients={data.recipients} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">등록된 어르신</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipientList recipients={data.recipients} />
        </CardContent>
      </Card>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <QuickSetupPanel hasFamily={data.recipients.length > 0} onCreated={reload} />
        <SimulatorPanel recipients={data.recipients} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Button asChild variant="outline" size="sm">
          <Link to="/policy">정책 문서</Link>
        </Button>
        <span>아직 실통화 없이 시뮬레이터로만 동작합니다 (Track B 검증 진행 중).</span>
      </div>
    </AppLayout>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "default" | "warning" | "danger";
}) {
  const ring =
    tone === "danger"
      ? "ring-1 ring-destructive/40"
      : tone === "warning"
        ? "ring-1 ring-amber-500/40"
        : "ring-1 ring-border";
  return (
    <div className={`rounded-xl bg-card p-4 ${ring}`}>
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 font-display text-3xl tracking-tight">{value}</div>
    </div>
  );
}

function AlertList({
  alerts,
  recipients,
}: {
  alerts: AnomalyAlertRow[];
  recipients: CareRecipientRow[];
}) {
  if (alerts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        열린 알림이 없습니다.
      </p>
    );
  }
  const nameOf = nameLookup(recipients);
  return (
    <ul className="divide-y divide-border">
      {alerts.map((a) => (
        <li key={a.id} className="flex items-start gap-3 py-3">
          <SeverityDot severity={a.severity} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{nameOf(a.care_recipient_id)}</span>
              <Badge variant="outline" className="text-[10px]">
                {a.rule_code}
              </Badge>
              <Badge variant={a.severity === "critical" ? "destructive" : "secondary"} className="text-[10px]">
                {a.severity}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-foreground/80">{a.guardian_message}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatDateTime(a.created_at)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SessionList({
  sessions,
  recipients,
}: {
  sessions: CallSessionRow[];
  recipients: CareRecipientRow[];
}) {
  if (sessions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        <PhoneCall className="mx-auto mb-2 h-5 w-5 opacity-40" />
        아직 진행된 통화가 없습니다.
      </div>
    );
  }
  const nameOf = nameLookup(recipients);
  return (
    <ul className="divide-y divide-border">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{nameOf(s.care_recipient_id)}</span>
              <Badge variant="outline" className="text-[10px]">
                {s.status}
              </Badge>
              {s.wrong_person_flag && (
                <Badge variant="secondary" className="text-[10px]">
                  본인 아님
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {s.started_at ? formatDateTime(s.started_at) : "시작 전"}
              {s.duration_sec != null && ` · ${s.duration_sec}초`}
              {s.end_reason && ` · ${s.end_reason}`}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecipientList({ recipients }: { recipients: CareRecipientRow[] }) {
  if (recipients.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        등록된 어르신이 없습니다. 가족(family) 과 어르신을 먼저 등록해주세요.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {recipients.map((r) => (
        <li key={r.id} className="flex items-center justify-between py-3 text-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{r.display_name}</span>
              <Badge variant="outline" className="text-[10px]">
                {r.status}
              </Badge>
              {r.do_not_disturb && (
                <Badge variant="secondary" className="text-[10px]">
                  방해금지
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {r.phone_e164} · 통화창 {r.call_window_start}–{r.call_window_end}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const color =
    severity === "critical"
      ? "bg-destructive"
      : severity === "warning"
        ? "bg-amber-500"
        : "bg-muted-foreground/40";
  return <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function nameLookup(recipients: CareRecipientRow[]) {
  const map = new Map(recipients.map((r) => [r.id, r.display_name]));
  return (id: string) => map.get(id) ?? "—";
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
