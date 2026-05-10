import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { Lock, Copy, Check } from "lucide-react";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import { supabase } from "@/integrations/supabase/client";
import { ANALYTICS_EVENTS } from "@/lib/analytics/eventNames";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/investor-kpi")({
  head: () => ({ meta: [{ title: "투자 지표 대시보드 — 곁" }] }),
  component: InvestorKpiPage,
});

type Period = "today" | "7d" | "30d" | "all";

type Kpi = {
  seniorUsers: number;
  caregiverLinks: number;
  voiceCheckStarted: number;
  voiceCheckCompleted: number;
  voiceCheckCompletionRate: number;
  repeatVoiceUsers3xWeekly: number;
  reportViewed: number;
  reportSharedToCaregiver: number;
  caregiverReportOpened: number;
  caregiverReportOpenRate: number;
  localInfoViewed: number;
  callButtonClicked: number;
  familyShareClicked: number;
  helpfulClicked: number;
  paidIntentClicked: number;
  organizationMeetings: number;
  organizationPilotDiscussing: number;
  organizationPilotConfirmed: number;
};

type Targets = {
  target_senior_users: number;
  target_caregiver_links: number;
  target_voice_checkins: number;
  target_voice_completion_rate: number;
  target_report_view_rate: number;
  target_organization_meetings: number;
};

function periodSinceIso(p: Period): string | null {
  const now = new Date();
  if (p === "today") {
    const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString();
  }
  if (p === "7d") return new Date(now.getTime() - 7 * 86400_000).toISOString();
  if (p === "30d") return new Date(now.getTime() - 30 * 86400_000).toISOString();
  return null;
}

async function countEvent(name: string, sinceIso: string | null) {
  let q = supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event_name", name);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { count } = await q;
  return count ?? 0;
}

async function loadKpis(period: Period): Promise<Kpi> {
  const since = periodSinceIso(period);

  // 시니어 가입자: family_members.role IN (primary_senior, senior)
  let seniorQ = supabase.from("family_members").select("*", { count: "exact", head: true }).in("role", ["primary_senior", "senior"]);
  if (since) seniorQ = seniorQ.gte("created_at", since);
  const { count: seniorUsers } = await seniorQ;

  // 보호자 연결: family_members.role IN (primary_guardian, secondary_guardian, guardian)
  let guardQ = supabase.from("family_members").select("*", { count: "exact", head: true }).in("role", ["primary_guardian", "secondary_guardian", "guardian"]);
  if (since) guardQ = guardQ.gte("created_at", since);
  const { count: caregiverLinks } = await guardQ;

  const [
    started, completed, reportViewed, reportShared, caregiverOpened,
    localViewed, callClicked, familyShare, helpful, paidIntent,
  ] = await Promise.all([
    countEvent(ANALYTICS_EVENTS.VOICE_CHECK_STARTED, since),
    countEvent(ANALYTICS_EVENTS.VOICE_CHECK_COMPLETED, since),
    countEvent(ANALYTICS_EVENTS.REPORT_VIEWED, since),
    countEvent(ANALYTICS_EVENTS.REPORT_SHARED_TO_CAREGIVER, since),
    countEvent(ANALYTICS_EVENTS.CAREGIVER_REPORT_OPENED, since),
    countEvent(ANALYTICS_EVENTS.LOCAL_INFO_VIEWED, since),
    countEvent(ANALYTICS_EVENTS.CALL_BUTTON_CLICKED, since),
    countEvent(ANALYTICS_EVENTS.FAMILY_SHARE_CLICKED, since),
    countEvent(ANALYTICS_EVENTS.REACTION_HELPFUL_CLICKED, since),
    countEvent(ANALYTICS_EVENTS.PAID_INTENT_CLICKED, since),
  ]);

  // 주 3회 이상 (최근 7일 고정)
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: weekly } = await supabase
    .from("analytics_events")
    .select("user_id")
    .eq("event_name", ANALYTICS_EVENTS.VOICE_CHECK_COMPLETED)
    .gte("created_at", weekAgo)
    .not("user_id", "is", null)
    .limit(5000);
  const counter = new Map<string, number>();
  (weekly ?? []).forEach((r) => {
    const id = (r as { user_id: string | null }).user_id;
    if (id) counter.set(id, (counter.get(id) ?? 0) + 1);
  });
  const repeatVoiceUsers3xWeekly = Array.from(counter.values()).filter((c) => c >= 3).length;

  // 기관 파이프라인
  const { data: orgs } = await supabase.from("organization_pipeline").select("status");
  const all = orgs ?? [];
  const organizationMeetings = all.filter((o) => ["미팅 예정", "미팅 완료", "파일럿 논의", "파일럿 확정"].includes(o.status)).length;
  const organizationPilotDiscussing = all.filter((o) => o.status === "파일럿 논의").length;
  const organizationPilotConfirmed = all.filter((o) => o.status === "파일럿 확정").length;

  return {
    seniorUsers: seniorUsers ?? 0,
    caregiverLinks: caregiverLinks ?? 0,
    voiceCheckStarted: started,
    voiceCheckCompleted: completed,
    voiceCheckCompletionRate: started > 0 ? Math.round((completed / started) * 1000) / 10 : 0,
    repeatVoiceUsers3xWeekly,
    reportViewed,
    reportSharedToCaregiver: reportShared,
    caregiverReportOpened: caregiverOpened,
    caregiverReportOpenRate: reportShared > 0 ? Math.round((caregiverOpened / reportShared) * 1000) / 10 : 0,
    localInfoViewed: localViewed,
    callButtonClicked: callClicked,
    familyShareClicked: familyShare,
    helpfulClicked: helpful,
    paidIntentClicked: paidIntent,
    organizationMeetings,
    organizationPilotDiscussing,
    organizationPilotConfirmed,
  };
}

function InvestorKpiPage() {
  const { loading } = useAuth();
  const { data: appState, isLoading: appStateLoading } = useAppState();
  const isAdmin = appState?.role === "admin";
  const [period, setPeriod] = useState<Period>("30d");
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    setBusy(true);
    Promise.all([
      loadKpis(period),
      supabase.from("investor_kpi_targets").select("*").eq("period_type", "30d").maybeSingle().then((r) => r.data as Targets | null),
    ])
      .then(([k, t]) => { setKpi(k); setTargets(t); })
      .catch((e) => { console.error(e); toast.error("KPI 불러오기 실패"); })
      .finally(() => setBusy(false));
  }, [isAdmin, period]);

  const irText = useMemo(() => {
    if (!kpi) return "";
    return `최근 ${labelPeriod(period)} 기준, 시니어 사용자 ${kpi.seniorUsers}명 중 음성 건강체크 시작은 ${kpi.voiceCheckStarted}건, 완료는 ${kpi.voiceCheckCompleted}건 발생했습니다. 음성체크 완료율은 ${kpi.voiceCheckCompletionRate}%이며, 최근 7일 동안 주 3회 이상 반복 사용한 시니어는 ${kpi.repeatVoiceUsers3xWeekly}명입니다. 보호자 리포트 열람은 ${kpi.caregiverReportOpened}건, 가족 공유 클릭은 ${kpi.familyShareClicked}건 발생했습니다. 현재 기관 미팅은 ${kpi.organizationMeetings}곳 진행되었고, 파일럿 논의 또는 확정 기관은 ${kpi.organizationPilotDiscussing + kpi.organizationPilotConfirmed}곳입니다.`;
  }, [kpi, period]);

  if (loading || appStateLoading) return null;
  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-md rounded-3xl border border-border/60 bg-card p-10 text-center">
          <Lock className="mx-auto h-6 w-6 text-primary" />
          <h1 className="mt-4 font-display text-2xl">관리자 전용</h1>
          <Button asChild variant="hero" className="mt-5 rounded-full"><Link to="/auth">로그인</Link></Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">관리자 · KPI</p>
          <h1 className="font-display text-3xl text-foreground sm:text-4xl">투자 지표 대시보드</h1>
        </div>
        <div className="flex gap-2">
          {(["today", "7d", "30d", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-full border px-4 py-1.5 text-sm ${period === p ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}
            >{labelPeriod(p)}</button>
          ))}
        </div>
      </header>

      {busy || !kpi ? (
        <p className="mt-10 text-sm text-muted-foreground">불러오는 중…</p>
      ) : (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card label="시니어 가입자" value={kpi.seniorUsers} target={targets?.target_senior_users} />
            <Card label="보호자 연결" value={kpi.caregiverLinks} target={targets?.target_caregiver_links} />
            <Card label="음성체크 완료율" value={`${kpi.voiceCheckCompletionRate}%`} sub={`${kpi.voiceCheckCompleted} / ${kpi.voiceCheckStarted}`} target={targets ? `${targets.target_voice_completion_rate}%` : undefined} />
            <Card label="주3회 이상 반복(7일)" value={kpi.repeatVoiceUsers3xWeekly} />
            <Card label="보호자 리포트 열람률" value={`${kpi.caregiverReportOpenRate}%`} sub={`${kpi.caregiverReportOpened} / ${kpi.reportSharedToCaregiver}`} target={targets ? `${targets.target_report_view_rate}%` : undefined} />
            <Card label="유료 결제 의향 클릭" value={kpi.paidIntentClicked} />
            <Card label="기관 미팅" value={kpi.organizationMeetings} target={targets?.target_organization_meetings} />
            <Card label="파일럿 논의/확정" value={kpi.organizationPilotDiscussing + kpi.organizationPilotConfirmed} sub={`논의 ${kpi.organizationPilotDiscussing} · 확정 ${kpi.organizationPilotConfirmed}`} />
          </section>

          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card label="음성체크 시작" value={kpi.voiceCheckStarted} />
            <Card label="음성체크 완료" value={kpi.voiceCheckCompleted} target={targets?.target_voice_checkins} />
            <Card label="리포트 보기" value={kpi.reportViewed} />
            <Card label="보호자 공유" value={kpi.reportSharedToCaregiver} />
            <Card label="동네정보 조회" value={kpi.localInfoViewed} />
            <Card label="전화하기 클릭" value={kpi.callButtonClicked} />
            <Card label="가족 공유 클릭" value={kpi.familyShareClicked} />
            <Card label="도움됐어요" value={kpi.helpfulClicked} />
          </section>

          <section className="mt-10 rounded-3xl border border-border/60 bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">IR용 요약 문장</h2>
              <Button
                size="sm" variant="outline" className="gap-1.5"
                onClick={() => {
                  navigator.clipboard?.writeText(irText);
                  setCopied(true);
                  toast.success("복사했어요");
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                복사
              </Button>
            </div>
            <p className="mt-3 whitespace-pre-line rounded-2xl bg-surface p-4 text-sm leading-relaxed text-foreground">{irText}</p>
          </section>

          <p className="mt-6 text-xs text-muted-foreground">
            * 기관/파일럿 관리는 별도 페이지에서 곧 제공합니다. 본 대시보드는 집계 지표만 표시하며, 개별 사용자 건강정보는 노출하지 않습니다.
          </p>
        </>
      )}
    </AdminLayout>
  );
}

function labelPeriod(p: Period) {
  return ({ today: "오늘", "7d": "7일", "30d": "30일", all: "전체" } as const)[p];
}

function Card({ label, value, sub, target }: { label: string; value: string | number; sub?: string; target?: string | number }) {
  const pct = typeof target === "number" && typeof value === "number" && target > 0
    ? Math.min(100, Math.round((value / target) * 100))
    : null;
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-3 font-display text-2xl text-foreground">{value}</p>
      {target !== undefined && (
        <p className="mt-1 text-xs text-muted-foreground">목표 {target}{pct !== null ? ` · ${pct}%` : ""}</p>
      )}
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
