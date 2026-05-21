import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  HeartPulse,
  AlertTriangle,
  Phone,
  Utensils,
  Pill,
  Smile,
  Activity,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";
import { getFamilySharedReports } from "@/lib/checkin/checkin-actions";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { ANALYTICS_EVENTS } from "@/lib/analytics/eventNames";

export const Route = createFileRoute("/watch")({
  ssr: false,
  beforeLoad: requireAuthBeforeLoad,
  head: () => ({
    meta: [
      { title: "오늘 안부 — 곁" },
      {
        name: "description",
        content: "보호자가 어르신의 오늘 음성 안부 결과와 AI 요약을 한 화면에서 확인합니다.",
      },
    ],
  }),
  component: WatchPage,
});

type Reports = Awaited<ReturnType<typeof getFamilySharedReports>>;
type ReportItem = Reports[number];

interface SeniorContact {
  display_name: string;
  phone_e164: string | null;
}

function WatchPage() {
  const { isAuthenticated, loading } = useAuth();
  const { data: appState } = useAppState({ enabled: isAuthenticated });
  const navigate = useNavigate();
  const [reports, setReports] = useState<Reports>([]);
  const [contact, setContact] = useState<SeniorContact | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate({ to: "/auth", search: { mode: "signin" } });
      return;
    }
    if (appState?.role === "senior") navigate({ to: "/home" });
    else if (appState?.role === "admin") navigate({ to: "/admin" });
  }, [loading, isAuthenticated, appState, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const { data: session } = await getSessionCached();
        const token = session.session?.access_token;
        const list = await getFamilySharedReports({
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        } as Parameters<typeof getFamilySharedReports>[0]);
        setReports(list);

        // 어르신 연락처 (전화하기 버튼용)
        const { data: recipients } = await supabase
          .from("care_recipients")
          .select("display_name, phone_e164")
          .order("created_at", { ascending: true })
          .limit(1);
        if (recipients?.[0]) setContact(recipients[0] as SeniorContact);

        if (list[0]) {
          void trackEvent({
            eventName: ANALYTICS_EVENTS.CAREGIVER_REPORT_OPENED,
            userRole: "guardian",
            targetType: "health_report",
            targetId: list[0].id,
          });
        }
      } catch (e) {
        console.error(e);
        setReports([]);
      } finally {
        setBusy(false);
      }
    })();
  }, [isAuthenticated]);

  const today = reports[0];
  const past = useMemo(() => reports.slice(1, 6), [reports]);
  const todayIsToday = useMemo(() => isSameDayKST(today?.checkin_at), [today]);

  if (loading || !appState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }

  if (appState.role !== "guardian") {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-2xl text-foreground">아직 연결된 어르신이 없어요</h1>
        <p className="text-sm text-muted-foreground">
          어르신이 보낸 초대 링크를 클릭하면 오늘 안부를 확인할 수 있어요.
        </p>
        <Button asChild variant="outline">
          <Link to="/">홈으로</Link>
        </Button>
      </div>
    );
  }

  const stateTone = pickStateTone(today, todayIsToday);

  return (
    <div className="min-h-screen bg-warm-gradient pb-16">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              오늘 안부
            </p>
            <h1 className="font-display text-2xl text-foreground">
              {contact?.display_name ?? "어르신"}
            </h1>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/guardian/dashboard">
              상세 <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-5 px-5 py-6">
        {busy ? (
          <div className="flex items-center justify-center py-16 text-foreground/60">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 불러오는 중…
          </div>
        ) : !today ? (
          <EmptyToday />
        ) : (
          <>
            {/* 오늘 상태 큰 카드 */}
            <section
              className={`rounded-3xl border-2 p-6 shadow-soft ${stateTone.bg} ${stateTone.border}`}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/70">
                <HeartPulse className="h-4 w-4" />
                {todayIsToday ? "오늘" : formatRelativeKST(today.checkin_at)} 음성 안부
              </p>
              <p className="mt-2 font-display text-3xl text-foreground">
                {stateTone.title}
              </p>
              <p className="mt-1 text-sm text-foreground/60">
                {new Date(today.checkin_at).toLocaleString("ko-KR", {
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>

              {today.urgent_detected && (
                <p className="mt-4 flex items-center gap-2 rounded-2xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  주의 신호가 감지됐어요. 한 번 전화드려 보세요.
                </p>
              )}

              {/* 5문항 상태 */}
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <StatTile icon={<Utensils className="h-4 w-4" />} label="식사" value={today.meal_status} />
                <StatTile icon={<Activity className="h-4 w-4" />} label="몸상태" value={labelLevel(today.condition_level)} />
                <StatTile icon={<AlertTriangle className="h-4 w-4" />} label="통증" value={today.pain_status ?? null} />
                <StatTile icon={<Pill className="h-4 w-4" />} label="약" value={today.medicine_status} />
                <StatTile icon={<Smile className="h-4 w-4" />} label="기분" value={today.mood_status} />
              </div>

              {/* 액션 */}
              {contact?.phone_e164 && (
                <a
                  href={`tel:${contact.phone_e164}`}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground shadow-soft transition active:scale-[0.98]"
                >
                  <Phone className="h-5 w-5" /> {contact.display_name}께 전화하기
                </a>
              )}
            </section>

            {/* AI 요약 */}
            {today.report?.caregiver_report_text && (
              <section className="rounded-3xl border border-border/60 bg-background p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  AI 안부 요약
                </p>
                <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-foreground">
                  {today.report.caregiver_report_text}
                </p>
              </section>
            )}

            {today.turns.length > 0 && (
              <section className="rounded-3xl border border-border/60 bg-background p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  질문별 답변
                </p>
                <div className="mt-4 divide-y divide-border/60">
                  {today.turns.map((turn) => {
                    const answer = turn.corrected_answer || turn.user_answer;
                    return (
                      <article key={turn.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-bold text-primary">{turn.step_label}</p>
                          {turn.corrected_at && (
                            <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-foreground/55">
                              수정됨
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-foreground/60">{turn.ai_question}</p>
                        <p className="mt-2 rounded-2xl bg-surface px-4 py-3 text-base font-semibold leading-relaxed text-foreground">
                          {answer}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 지난 안부 */}
            {past.length > 0 && (
              <section>
                <h2 className="mb-2 px-1 font-display text-lg text-foreground">지난 안부</h2>
                <ul className="space-y-2">
                  {past.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-2xl border border-border/60 bg-background p-4"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-foreground/60">
                          {new Date(r.checkin_at).toLocaleString("ko-KR", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${badgeForLevel(r.condition_level)}`}>
                          {labelLevel(r.condition_level)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-base text-foreground">
                        {r.summary ?? r.report?.caregiver_report_text ?? "기록"}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function EmptyToday() {
  return (
    <div className="rounded-3xl border border-border/60 bg-background p-8 text-center">
      <p className="font-display text-xl text-foreground">아직 오늘 안부가 없어요</p>
      <p className="mt-2 text-sm text-foreground/60">
        어르신이 음성 안부를 마치면 이 화면에 자동으로 올라와요.
      </p>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-2xl bg-background/80 p-3">
      <div className="flex items-center gap-1.5 text-xs text-foreground/60">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-base font-semibold text-foreground">{value ?? "—"}</p>
    </div>
  );
}

function pickStateTone(
  today: ReportItem | undefined,
  isToday: boolean,
): { title: string; bg: string; border: string } {
  if (!today || !isToday) {
    return {
      title: "오늘 안부 대기 중",
      bg: "bg-background",
      border: "border-border/60",
    };
  }
  if (today.urgent_detected || today.condition_level === "urgent") {
    return { title: "긴급 확인 필요", bg: "bg-destructive/5", border: "border-destructive/40" };
  }
  if (today.condition_level === "caution") {
    return { title: "조금 살펴봐 주세요", bg: "bg-amber-500/5", border: "border-amber-500/40" };
  }
  if (today.condition_level === "good") {
    return { title: "오늘은 평안하세요", bg: "bg-emerald-500/5", border: "border-emerald-500/40" };
  }
  return { title: "오늘도 평소처럼", bg: "bg-background", border: "border-primary/30" };
}

function badgeForLevel(l: string) {
  if (l === "urgent") return "bg-destructive/10 text-destructive";
  if (l === "caution") return "bg-amber-500/10 text-amber-700";
  if (l === "good") return "bg-emerald-500/10 text-emerald-700";
  return "bg-muted text-foreground/70";
}

function labelLevel(l: string) {
  return { good: "좋음", normal: "보통", caution: "주의", urgent: "긴급" }[l] ?? l;
}

function isSameDayKST(iso: string | undefined): boolean {
  if (!iso) return false;
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
  return fmt.format(new Date(iso)) === fmt.format(new Date());
}

function formatRelativeKST(iso: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
  const a = new Date(fmt.format(new Date(iso)));
  const b = new Date(fmt.format(new Date()));
  const diff = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 1) return "어제";
  if (diff > 1) return `${diff}일 전`;
  return "최근";
}
