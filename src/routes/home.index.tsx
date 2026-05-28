import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import { DailyVoiceCheckin } from "@/components/voice/DailyVoiceCheckin";
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  MessageCircleHeart,
  HeartPulse,
  Calendar,
  TrendingUp,
  RotateCcw,
  Smile,
  Utensils,
  Pill,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTodayCheckin, useInvalidateTodayCheckin } from "@/lib/checkin/use-today-checkin";
import { CheckinOverview } from "@/components/checkin/CheckinOverview";
import { RecommendationCarousel } from "@/components/checkin/RecommendationCarousel";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { ANALYTICS_EVENTS } from "@/lib/analytics/eventNames";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/home/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "오늘의 곁 — 홈" },
      {
        name: "description",
        content: "매일 한 번 음성으로 안부를 나누고, 오늘의 상태를 가족과 함께 확인해요.",
      },
    ],
  }),
  component: SeniorHome,
});

type Tab = "today" | "week" | "details";

const TABS: { key: Tab; label: string; sub: string }[] = [
  { key: "today", label: "오늘", sub: "지금 어떠신가요" },
  { key: "week", label: "이번 주", sub: "7일 흐름" },
  { key: "details", label: "자세히", sub: "지표·달력" },
];

/* ── 상태 → 이모지·라벨·색 매핑 ─────────────────────────── */
function moodMeta(mood?: string | null) {
  if (!mood) return { emoji: "😊", label: "—", color: "bg-rose-soft", text: "text-primary/60" };
  if (/좋음|good|밝/i.test(mood)) return { emoji: "😄", label: "좋음", color: "bg-rose-soft", text: "text-primary" };
  if (/보통|normal|평/i.test(mood)) return { emoji: "🙂", label: "보통", color: "bg-rose-soft", text: "text-foreground" };
  if (/저하|bad|low|우울/i.test(mood)) return { emoji: "🥺", label: "저하", color: "bg-rose-soft", text: "text-rose-700" };
  return { emoji: "🙂", label: mood.slice(0, 3), color: "bg-rose-soft", text: "text-primary" };
}

function mealMeta(meal?: string | null) {
  if (!meal) return { emoji: "🍚", label: "—", color: "bg-amber-soft", text: "text-amber-warm/60" };
  if (/정상|충분|잘|챙김|good/i.test(meal)) return { emoji: "🍱", label: "챙김", color: "bg-amber-soft", text: "text-amber-warm" };
  if (/부족|skip|건너|적/i.test(meal)) return { emoji: "🥣", label: "부족", color: "bg-amber-soft", text: "text-amber-warm" };
  return { emoji: "🍚", label: meal.slice(0, 3), color: "bg-amber-soft", text: "text-amber-warm" };
}

function medicineMeta(med?: string | null) {
  if (!med) return { emoji: "💊", label: "—", color: "bg-sage-soft", text: "text-sage/70" };
  if (/완료|복용|taken|good/i.test(med)) return { emoji: "✅", label: "완료", color: "bg-sage-soft", text: "text-sage" };
  if (/누락|missed|안|skip/i.test(med)) return { emoji: "⚠️", label: "누락", color: "bg-amber-soft", text: "text-amber-warm" };
  return { emoji: "💊", label: med.slice(0, 3), color: "bg-sage-soft", text: "text-sage" };
}

function conditionMeta(cond?: string | null) {
  if (cond === "good") return { dot: "bg-sage", label: "양호", text: "text-sage" };
  if (cond === "normal") return { dot: "bg-amber-warm", label: "보통", text: "text-amber-warm" };
  if (cond === "caution") return { dot: "bg-amber-warm", label: "주의", text: "text-amber-warm" };
  if (cond === "urgent") return { dot: "bg-destructive", label: "긴급", text: "text-destructive" };
  return { dot: "bg-foreground/30", label: "—", text: "text-foreground/40" };
}

function SeniorHome() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { data: appState } = useAppState({ enabled: isAuthenticated });
  const navigate = useNavigate();
  const { data: today } = useTodayCheckin({ enabled: isAuthenticated });
  const invalidateToday = useInvalidateTodayCheckin();
  const [tab, setTab] = useState<Tab>("details");
  const [showTodayOverview, setShowTodayOverview] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: "/auth" });
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (appState && appState.role === "guardian") {
      navigate({ to: "/watch" as "/home" });
    }
  }, [appState, navigate]);

  useEffect(() => {
    if (today?.report) {
      void trackEvent({
        eventName: ANALYTICS_EVENTS.REPORT_VIEWED,
        userRole: "senior",
        targetType: "health_report",
        targetId: today.checkin?.id ?? null,
      });
    }
  }, [today?.report, today?.checkin?.id]);

  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 11 ? "좋은 아침이에요" : greetingHour < 18 ? "좋은 오후예요" : "편안한 저녁이에요";

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" }),
    [],
  );

  const checkin = today?.checkin;
  const report = today?.report;
  const recommendations = today?.recommendations ?? [];
  const turns = today?.turns ?? [];

  const mood = moodMeta(checkin?.mood_status);
  const meal = mealMeta((checkin as any)?.meal_status);
  const medicine = medicineMeta((checkin as any)?.medicine_status);
  const cond = conditionMeta(checkin?.condition_level);
  const checkinDone = !!checkin;

  if (authLoading || !isAuthenticated) {
    return (
      <SeniorAppLayout>
        <div className="flex items-center justify-center py-20 text-foreground/60">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 잠시만요…
        </div>
      </SeniorAppLayout>
    );
  }

  return (
    <SeniorAppLayout>
      {/* ─────────────────────────────────────────────────────────
       * 1. 헤더 — 인사 + 날짜 + 아바타 (목업 ScreenHome 스타일)
       * ─────────────────────────────────────────────────────────*/}
      <section className="px-1 pt-1 animate-rise-in">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-primary">
            <Calendar className="h-3 w-3" /> {dateLabel}
          </p>
          <h1 className="mt-3 font-display text-[1.65rem] font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
            {greeting},<br />
            <span className="text-primary">{user?.nickname ?? "어머님"}</span>님 👋
          </h1>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────
       * 2. 오늘 안부 통화 카드 (DailyVoiceCheckin — 자체 시각 디자인 유지)
       * ─────────────────────────────────────────────────────────*/}
      <section className="mt-5 animate-rise-in delay-100">
        <DailyVoiceCheckin
          nickname={user?.nickname}
          alreadyDoneToday={!!today?.checkin}
          todayCondition={(today?.checkin?.condition_level ?? null) as any}
          todayMood={today?.checkin?.mood_status ?? null}
          savedTurns={turns as any[]}
          onAnalyzed={() => {
            invalidateToday();
          }}
        />

        {/* ── 어드민 전용 리셋 — 개발/테스트 편의 ──
         *  관리자 계정에서만 표시. 오늘 안부 통화 기록을 삭제하고
         *  "다시 대화하기" 상태로 되돌림. 반복 테스트용. */}
        {appState?.role === "admin" && today?.checkin && user?.id && (
          <button
            type="button"
            onClick={async () => {
              const ok = window.confirm(
                "[관리자] 오늘 안부 통화 기록을 모두 삭제하고 다시 시작합니다. 진행할까요?",
              );
              if (!ok) return;
              try {
                const kst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
                const startISO = new Date(`${kst}T00:00:00+09:00`).toISOString();
                const { error } = await supabase
                  .from("health_checkins")
                  .delete()
                  .eq("senior_user_id", user.id)
                  .gte("checkin_at", startISO);
                if (error) throw error;
                toast.success("오늘 기록을 삭제했어요. 다시 통화할 수 있어요.");
                invalidateToday();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "삭제에 실패했어요");
              }
            }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-dashed border-amber-warm/50 bg-amber-soft/30 px-4 py-2.5 text-xs font-semibold text-amber-warm transition hover:bg-amber-soft/60"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            [어드민] 오늘 기록 삭제 + 다시 대화하기
          </button>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────
       * 3. 오늘의 한눈 보기
       *    안부 완료 시: 실데이터 / 미완료 시: dash + 안내
       * ─────────────────────────────────────────────────────────*/}
      <section className="mt-6 animate-rise-in delay-150">
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-soft">
          <button
            type="button"
            onClick={() => setShowTodayOverview((v) => !v)}
            className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left"
            aria-expanded={showTodayOverview}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Smile className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base font-bold text-foreground">오늘의 한눈 보기</h2>
              <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
                {checkinDone
                  ? `기분 ${mood.label} · 식사 ${meal.label} · 복약 ${medicine.label}`
                  : "통화를 마치면 오늘 상태가 채워져요"}
              </p>
            </div>
            {checkinDone && (
              <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-bold", cond.text)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", cond.dot)} />
                {cond.label}
              </span>
            )}
            <ChevronDown className={cn("h-5 w-5 shrink-0 text-foreground/45 transition-transform", showTodayOverview && "rotate-180")} />
          </button>
          {showTodayOverview && (
            <div className="border-t border-border/60">
              {[
                { meta: mood, key: "기분", icon: Smile },
                { meta: meal, key: "식사", icon: Utensils },
                { meta: medicine, key: "복약", icon: Pill },
              ].map(({ meta, key, icon: Icon }, index) => (
                <div
                  key={key}
                  className={cn(
                    "flex min-h-[64px] items-center gap-3 px-4 py-3",
                    index > 0 && "border-t border-border/60",
                  )}
                >
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", meta.color)}>
                    <Icon className={cn("h-5 w-5", meta.text)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-muted-foreground">{key}</p>
                    <p className={cn("mt-0.5 text-base font-bold leading-snug", meta.text)}>{meta.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {!checkinDone && (
          <p className="mt-3 rounded-2xl border border-border/60 bg-surface px-4 py-3 text-sm font-medium text-muted-foreground">
            안부 통화를 마치면 오늘의 한눈 보기가 채워져요
          </p>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────
       * 5. 이번 주 기록 — 실제 주간 상세 탭으로 이동
       * ─────────────────────────────────────────────────────────*/}
      <button
        type="button"
        onClick={() => setTab("week")}
        className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-background p-4 text-left shadow-soft transition active:scale-[0.99] hover:border-primary/40 animate-rise-in delay-200"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sage-soft">
          <TrendingUp className="h-5 w-5 text-sage" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">이번 주 기록 보기</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
            최근 7일 안부 통화와 컨디션 기록을 모아서 확인해요
          </p>
        </div>
        <ChevronRight className="self-center h-5 w-5 text-foreground/40" />
      </button>

      {/* ─────────────────────────────────────────────────────────
       * 6. 도움 받을 수 있는 곳 — 추천 카루셀
       * ─────────────────────────────────────────────────────────*/}
      {recommendations.length > 0 && (
        <section className="mt-5 animate-rise-in delay-300">
          <div className="rounded-2xl border border-border/70 bg-background p-5 shadow-soft">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-soft/80">
                  <HeartPulse className="h-4 w-4 text-amber-warm" />
                </span>
                <p className="font-display text-base font-bold text-foreground">도움 받을 수 있는 곳</p>
              </div>
              {recommendations.length > 1 && (
                <p className="text-xs font-medium text-muted-foreground">좌우로 넘기기</p>
              )}
            </div>
            <div className="mt-3">
              <RecommendationCarousel items={recommendations as any} />
            </div>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────
       * 7. 하단 — 자세히 보기 (이번 주 / 자세히 탭)
       * ─────────────────────────────────────────────────────────*/}
      <section className="mt-8 animate-rise-in delay-300">
        <nav
          className="grid grid-cols-3 gap-1.5 rounded-2xl bg-surface p-1.5"
          role="tablist"
          aria-label="자세히 보기"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex min-h-[52px] flex-col items-center justify-center rounded-xl px-2 transition-all duration-200",
                  active
                    ? "bg-background text-foreground shadow-soft"
                    : "text-foreground/50 hover:text-foreground/75",
                )}
              >
                <span className={cn("text-sm leading-tight", active ? "font-bold text-foreground" : "font-semibold")}>
                  {t.label}
                </span>
                <span className={cn("mt-0.5 text-[10px]", active ? "text-primary/70 font-medium" : "text-foreground/40")}>
                  {t.sub}
                </span>
              </button>
            );
          })}
        </nav>

        {tab === "today" && checkinDone && (
          <div className="mt-4" role="tabpanel">
            <TodayTurnList turns={turns as any[]} />
          </div>
        )}

        {tab === "week" && (
          <div className="mt-4" role="tabpanel">
            <CheckinOverview
              enabled={isAuthenticated}
              todayCheckin={today?.checkin ?? null}
              todayReport={today?.report ?? null}
              todayRecommendations={today?.recommendations ?? []}
              view="week"
            />
          </div>
        )}

        {tab === "details" && (
          <div className="mt-4" role="tabpanel">
            <CheckinOverview
              enabled={isAuthenticated}
              todayCheckin={today?.checkin ?? null}
              todayReport={today?.report ?? null}
              todayRecommendations={today?.recommendations ?? []}
              view="details"
            />
          </div>
        )}
      </section>
    </SeniorAppLayout>
  );
}

function TodayTurnList({
  turns,
}: {
  turns: Array<{
    id: string;
    step_label: string;
    ai_question: string;
    user_answer: string;
    corrected_answer?: string | null;
    corrected_at?: string | null;
  }>;
}) {
  if (turns.length === 0) {
    return (
      <p className="mt-6 px-2 text-center text-sm text-foreground/55">
        오늘 안부 통화를 잘 마치셨어요.
      </p>
    );
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-background p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MessageCircleHeart className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-display text-base font-bold text-foreground">오늘 대화 기록</h3>
          <p className="text-xs font-medium text-muted-foreground">질문별로 저장된 답변이에요</p>
        </div>
      </div>

      <div className="mt-4 divide-y divide-border/60">
        {turns.map((turn) => {
          const answer = turn.corrected_answer || turn.user_answer;
          return (
            <article key={turn.id} className="py-4 first:pt-0 last:pb-0">
              <p className="text-xs font-bold text-primary">{turn.step_label}</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/65">{turn.ai_question}</p>
              <p className="mt-2 rounded-xl bg-surface px-4 py-3 text-base font-semibold leading-relaxed text-foreground">
                {answer}
              </p>
              {turn.corrected_at && (
                <p className="mt-1.5 text-xs font-medium text-muted-foreground">수정 반영됨</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
