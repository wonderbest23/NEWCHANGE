import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/brand/StatusBadge";
import {
  ArrowUpRight,
  Lock,
  PhoneCall,
  HeartPulse,
  AlertTriangle,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import { getAdminDashboard, type AdminDashboardRecent } from "@/server/admin/dashboard.functions";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "운영 대시보드 — 곁" },
      {
        name: "description",
        content: "AI 음성 안부 운영 지표와 주의 신호를 한 화면에서 확인합니다.",
      },
    ],
  }),
  component: AdminPage,
});

type RecentCheckin = AdminDashboardRecent;

const EMPTY_STATS = { seniors: 0, todayCheckins: 0, weekCheckins: 0, urgentOpen: 0 };
const EMPTY_LEVELS = { good: 0, normal: 0, caution: 0, urgent: 0 };
const EMPTY_HOURS = Array(24).fill(0) as number[];
const EMPTY_QUALITY = {
  totalEvents: 0,
  completedCalls: 0,
  failedCalls: 0,
  draftSaved: 0,
  correctionEvents: 0,
  avgStepCompletionPct: 0,
  missingStepEventPct: 0,
  urgentQualityEvents: 0,
  avgJitterMs: null as number | null,
  avgRttMs: null as number | null,
  packetLossEvents: 0,
  topIssueFlags: [] as { flag: string; count: number }[],
};

function AdminPage() {
  const { user, loading } = useAuth();
  const { data: appState, isLoading: appStateLoading } = useAppState();
  const isAdmin = appState?.role === "admin";
  const fetchDashboard = useServerFn(getAdminDashboard);

  const { data: dash } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => fetchDashboard(),
    enabled: !!isAdmin,
    staleTime: 60_000,
  });

  const stats = dash?.stats ?? EMPTY_STATS;
  const byLevel = dash?.byLevel ?? EMPTY_LEVELS;
  const recent: RecentCheckin[] = dash?.recent ?? [];
  const seoulDistricts = dash?.seoulDistricts ?? [];
  const otherCount = dash?.otherCount ?? 0;
  const districtCheckins = dash?.districtCheckins ?? [];
  const hourlyDist = dash?.hourlyDist ?? EMPTY_HOURS;
  const quality = dash?.quality ?? EMPTY_QUALITY;

  if (loading || appStateLoading) return null;

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-md rounded-3xl border border-border/60 bg-card p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-soft">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-4 font-display text-2xl">관리자 전용</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            관리자 권한이 필요합니다.
          </p>
          <Button asChild variant="hero" className="mt-5 rounded-full">
            <Link to="/auth">로그인</Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const total = byLevel.good + byLevel.normal + byLevel.caution + byLevel.urgent || 1;

  return (
    <AdminLayout>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">관리자 · {user?.nickname ?? "운영자"}</p>
          <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            오늘의 안부 지표
          </h1>
        </div>
        <StatusBadge tone="sage" dot>Cloud 연결됨</StatusBadge>
      </header>

      {/* 핵심 지표 4개 */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Users className="h-4 w-4" />}
          label="등록 어르신"
          value={stats.seniors.toLocaleString()}
        />
        <Stat
          icon={<PhoneCall className="h-4 w-4" />}
          label="오늘 안부 통화"
          value={stats.todayCheckins.toLocaleString()}
        />
        <Stat
          icon={<HeartPulse className="h-4 w-4" />}
          label="최근 7일 통화"
          value={stats.weekCheckins.toLocaleString()}
        />
        <Stat
          icon={<AlertTriangle className="h-4 w-4" />}
          label="열린 주의 신호"
          value={stats.urgentOpen.toLocaleString()}
          tone={stats.urgentOpen > 0 ? "rose" : "sage"}
        />
      </section>

      <section className="mt-8 rounded-3xl border border-border/60 bg-card p-6">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-xl text-foreground">안부전화 품질</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              최근 7일 기준 · 완료율, 누락률, 수정률, WebRTC 음성 품질 통계
            </p>
          </div>
          <StatusBadge tone={quality.failedCalls > 0 || quality.missingStepEventPct >= 20 ? "amber" : "sage"} dot>
            {quality.totalEvents}건 기록
          </StatusBadge>
        </header>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QualityMetric label="질문 완료율" value={`${quality.avgStepCompletionPct}%`} />
          <QualityMetric label="답변 누락 세션" value={`${quality.missingStepEventPct}%`} tone={quality.missingStepEventPct >= 20 ? "warn" : "ok"} />
          <QualityMetric label="실패/짧은 통화" value={`${quality.failedCalls}건`} tone={quality.failedCalls > 0 ? "warn" : "ok"} />
          <QualityMetric label="수정 발생" value={`${quality.correctionEvents}건`} />
          <QualityMetric label="긴급 감지" value={`${quality.urgentQualityEvents}건`} tone={quality.urgentQualityEvents > 0 ? "warn" : "ok"} />
          <QualityMetric label="평균 jitter" value={quality.avgJitterMs == null ? "—" : `${quality.avgJitterMs}ms`} tone={(quality.avgJitterMs ?? 0) >= 80 ? "warn" : "ok"} />
          <QualityMetric label="평균 RTT" value={quality.avgRttMs == null ? "—" : `${quality.avgRttMs}ms`} tone={(quality.avgRttMs ?? 0) >= 500 ? "warn" : "ok"} />
          <QualityMetric label="패킷 손실 관측" value={`${quality.packetLossEvents}건`} tone={quality.packetLossEvents > 0 ? "warn" : "ok"} />
        </div>

        {quality.topIssueFlags.length > 0 && (
          <div className="mt-5 rounded-2xl bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">자주 나온 품질 플래그</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {quality.topIssueFlags.map((item) => (
                <span key={item.flag} className="rounded-full border border-border/70 bg-card px-3 py-1 text-sm text-foreground/80">
                  {labelIssueFlag(item.flag)} · {item.count}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 7일 상태 분포 + 최근 통화 */}
      <section className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-border/60 bg-card p-6">
          <h2 className="font-display text-xl text-foreground">7일 상태 분포</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            전체 {total === 1 && byLevel.good + byLevel.normal + byLevel.caution + byLevel.urgent === 0 ? 0 : total}건
          </p>
          <ul className="mt-5 flex flex-col gap-3">
            <DistRow label="좋음" value={byLevel.good} total={total} color="bg-emerald-500" />
            <DistRow label="보통" value={byLevel.normal} total={total} color="bg-primary" />
            <DistRow label="주의" value={byLevel.caution} total={total} color="bg-amber-500" />
            <DistRow label="긴급" value={byLevel.urgent} total={total} color="bg-destructive" />
          </ul>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-6 lg:col-span-2">
          <header className="flex items-center justify-between">
            <h2 className="font-display text-xl text-foreground">최근 안부 통화</h2>
          </header>
          <div className="mt-5 overflow-hidden rounded-2xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">시각</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">요약</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                      아직 통화 기록이 없습니다.
                    </td>
                  </tr>
                ) : (
                  recent.map((r) => (
                    <tr key={r.id} className="bg-card">
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(r.checkin_at).toLocaleString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={toneForLevel(r.condition_level)} dot>
                          {labelLevel(r.condition_level)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-foreground line-clamp-1">
                        {r.urgent_detected && (
                          <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-destructive" />
                        )}
                        {r.summary ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 서울 자치구별 분포 */}
      <section className="mt-10 rounded-3xl border border-border/60 bg-card p-6">
        <header className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl text-foreground">서울 자치구별 사용자 분포</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              서울 25개 자치구 전체 분포 · 그 외 지역은 ‘기타’로 집계
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            총 {seoulDistricts.reduce((s, d) => s + d.count, 0) + otherCount}명
          </span>
        </header>
        {(() => {
          const rows = [...seoulDistricts, { name: "기타", count: otherCount }];
          const max = Math.max(1, ...rows.map((r) => r.count));
          return (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {rows.map((d) => {
                const pct = Math.round((d.count / max) * 100);
                const isOther = d.name === "기타";
                return (
                  <li key={d.name}>
                    <div className="flex items-center justify-between text-sm">
                      <span className={isOther ? "text-muted-foreground" : "text-foreground/80"}>
                        {d.name}
                      </span>
                      <span className="text-muted-foreground">{d.count}명</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${isOther ? "bg-muted-foreground/40" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          );
        })()}
      </section>

      {/* 자치구별 안부 통화 집계 */}
      <section className="mt-10 rounded-3xl border border-border/60 bg-card p-6">
        <header className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl text-foreground">자치구별 안부 통화 집계</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              최근 7일 기준 · 오늘/주간 통화 수와 주의·긴급 비율
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            통화가 발생한 자치구만 표시
          </span>
        </header>
        {districtCheckins.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            아직 자치구별 안부 통화 기록이 없습니다.
          </p>
        ) : (
          <div className="mt-5 overflow-hidden rounded-2xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">자치구</th>
                  <th className="px-4 py-3 font-medium text-right">오늘</th>
                  <th className="px-4 py-3 font-medium text-right">7일</th>
                  <th className="px-4 py-3 font-medium text-right">주의</th>
                  <th className="px-4 py-3 font-medium text-right">긴급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {districtCheckins.map((d) => (
                  <tr key={d.name} className="bg-card">
                    <td className="px-4 py-3 text-foreground/90">{d.name}</td>
                    <td className="px-4 py-3 text-right text-foreground">{d.today}</td>
                    <td className="px-4 py-3 text-right text-foreground">{d.week}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={d.cautionPct > 0 ? "text-amber-600" : "text-muted-foreground"}>
                        {d.cautionPct}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={d.urgentPct > 0 ? "text-destructive" : "text-muted-foreground"}>
                        {d.urgentPct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 시간대별 통화 분포 */}
      <section className="mt-10 rounded-3xl border border-border/60 bg-card p-6">
        <header className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl text-foreground">시간대별 통화 분포</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              최근 7일 · KST 기준 0~23시 안부 통화 발생 분포
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            총 {hourlyDist.reduce((a, b) => a + b, 0)}건
          </span>
        </header>
        {(() => {
          const max = Math.max(1, ...hourlyDist);
          const peak = hourlyDist.indexOf(Math.max(...hourlyDist));
          const total = hourlyDist.reduce((a, b) => a + b, 0);
          return (
            <>
              <div className="mt-6 flex h-40 items-end gap-1">
                {hourlyDist.map((v, h) => {
                  const pct = (v / max) * 100;
                  const isPeak = total > 0 && h === peak;
                  return (
                    <div key={h} className="flex flex-1 flex-col items-center gap-1">
                      <div className="relative w-full flex-1">
                        <div
                          className={`absolute bottom-0 left-0 right-0 rounded-t ${
                            isPeak ? "bg-primary" : "bg-primary/40"
                          }`}
                          style={{ height: `${pct}%`, minHeight: v > 0 ? 2 : 0 }}
                          title={`${h}시 · ${v}건`}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {h % 3 === 0 ? h : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              {total > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  피크 시간대: <span className="font-medium text-foreground">{peak}시</span> ·{" "}
                  {hourlyDist[peak]}건
                </p>
              )}
            </>
          );
        })()}
      </section>


      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ToolLink
          to="/admin/voice-test"
          title="🎙 음성 통화 시뮬레이션"
          desc="브라우저 마이크로 AI 안부 흐름을 직접 점검합니다."
        />
        <ToolLink
          to="/admin/ingest"
          title="🗂 로컬 데이터 수집기"
          desc="자치구별 복지·행사·자원 데이터를 수집·관리합니다."
        />
        <ToolLink
          to="/admin/agencies"
          title="🏛 기관 관리"
          desc="복지관·자치구 기관 목록과 연결 상태를 관리합니다."
        />
      </section>
    </AdminLayout>
  );
}

function ToolLink({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="rounded-3xl border border-border/60 bg-card p-6 transition hover:border-primary/40 hover:bg-accent/30"
    >
      <h3 className="font-display text-lg text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
        열기 <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

function DistRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = Math.round((value / total) * 100);
  return (
    <li>
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground/80">{label}</span>
        <span className="text-muted-foreground">
          {value} ({pct}%)
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function Stat({
  icon,
  label,
  value,
  tone = "sage",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "sage" | "rose";
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            tone === "rose" ? "bg-destructive/10 text-destructive" : "bg-accent text-foreground"
          }`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 font-display text-2xl text-foreground">{value}</p>
    </div>
  );
}

function QualityMetric({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={tone === "warn" ? "mt-2 font-display text-2xl text-destructive" : "mt-2 font-display text-2xl text-foreground"}>
        {value}
      </p>
    </div>
  );
}

function labelIssueFlag(flag: string) {
  return {
    missing_steps: "질문 누락",
    high_jitter: "지터 높음",
    high_rtt: "응답 지연",
    packet_loss_seen: "패킷 손실",
    save_failed: "저장 실패",
    too_short: "짧은 통화",
    urgent_notice: "긴급 표현",
  }[flag] ?? flag;
}

function labelLevel(l: string) {
  return { good: "좋음", normal: "보통", caution: "주의", urgent: "긴급" }[l] ?? l;
}

function toneForLevel(l: string): "sage" | "amber" | "rose" {
  if (l === "urgent") return "rose";
  if (l === "caution") return "amber";
  return "sage";
}

function startOfTodayKST(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
  const today = fmt.format(new Date());
  // KST midnight = UTC 15:00 previous day
  return new Date(`${today}T00:00:00+09:00`).toISOString();
}
