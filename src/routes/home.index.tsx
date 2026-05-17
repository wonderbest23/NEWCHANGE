import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import { SeniorAppLayout } from "@/components/layouts/SeniorAppLayout";
import { DailyVoiceCheckin } from "@/components/voice/DailyVoiceCheckin";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  Loader2,
  Send,
  Sparkles,
  MapPin,
  MessageCircleHeart,
  HeartPulse,
  Calendar,
  TrendingUp,
  RotateCcw,
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
  const [tab, setTab] = useState<Tab>("today");

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

  const userInitial = (user?.nickname?.[0] ?? "곁").toUpperCase();
  const checkin = today?.checkin;
  const report = today?.report;
  const recommendations = today?.recommendations ?? [];

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
      <section className="flex items-start justify-between gap-3 px-1 pt-1 animate-rise-in">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-primary">
            <Calendar className="h-3 w-3" /> {dateLabel}
          </p>
          <h1 className="mt-3 font-display text-[1.65rem] font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
            {greeting},<br />
            <span className="text-primary">{user?.nickname ?? "어머님"}</span>님 👋
          </h1>
        </div>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-soft to-amber-soft text-lg font-bold text-primary shadow-soft">
          {userInitial}
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
       * 3. 오늘의 한눈 보기 — 3컬럼 이모지 카드 (목업 스타일)
       *    안부 완료 시: 실데이터 / 미완료 시: dash + 격려 메시지
       * ─────────────────────────────────────────────────────────*/}
      <section className="mt-6 animate-rise-in delay-150">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="font-display text-lg font-bold text-foreground">오늘의 한눈 보기</h2>
          {checkinDone && (
            <span className={cn("inline-flex items-center gap-1 text-xs font-bold", cond.text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", cond.dot)} />
              컨디션 {cond.label}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { meta: mood, key: "기분" },
            { meta: meal, key: "식사" },
            { meta: medicine, key: "복약" },
          ].map(({ meta, key }) => (
            <div
              key={key}
              className={cn(
                "relative overflow-hidden rounded-2xl border-2 border-border/40 px-3 py-4 text-center transition",
                meta.color,
              )}
            >
              <span className="text-3xl">{meta.emoji}</span>
              <p className="mt-1 text-[11px] font-semibold text-foreground/55">{key}</p>
              <p className={cn("mt-0.5 text-sm font-bold", meta.text)}>{meta.label}</p>
            </div>
          ))}
        </div>
        {!checkinDone && (
          <p className="mt-3 rounded-2xl bg-rose-soft/40 px-4 py-3 text-center text-sm font-medium text-foreground/70">
            안부 통화를 마치면 오늘의 한눈 보기가 채워져요
          </p>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────
       * 4. AI 한 줄 요약 — 안부 완료 시
       * ─────────────────────────────────────────────────────────*/}
      {checkinDone && report?.senior_report_text && (
        <section className="mt-5 animate-rise-in delay-200">
          <div className="relative overflow-hidden rounded-3xl border-2 border-primary/20 bg-gradient-to-br from-rose-soft/60 via-background to-amber-soft/40 p-5 shadow-soft">
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/8 blur-2xl" aria-hidden />
            <div className="relative flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">AI 한 줄 요약</p>
                <p className="mt-1.5 text-base leading-relaxed text-foreground">
                  {report.senior_report_text}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────
       * 5. 이번 주 흐름 — 미니 바 차트 (탭 클릭 시 week 탭으로)
       * ─────────────────────────────────────────────────────────*/}
      <button
        type="button"
        onClick={() => setTab("week")}
        className="mt-5 flex w-full items-stretch gap-3 rounded-3xl border-2 border-border/60 bg-background p-4 text-left shadow-soft transition active:scale-[0.99] hover:border-primary/40 animate-rise-in delay-200"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sage-soft">
          <TrendingUp className="h-5 w-5 text-sage" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">이번 주 흐름</p>
          <div className="mt-2 flex items-end gap-1 h-8">
            {[65, 80, 55, 90, 75, 85, 70].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm bg-gradient-to-t from-primary/70 to-primary/25"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between">
            {["월", "화", "수", "목", "금", "토", "일"].map((d) => (
              <span key={d} className="flex-1 text-center text-[10px] text-foreground/40">{d}</span>
            ))}
          </div>
        </div>
        <ChevronRight className="self-center h-5 w-5 text-foreground/40" />
      </button>

      {/* ─────────────────────────────────────────────────────────
       * 6. 도움 받을 수 있는 곳 — 추천 카루셀
       * ─────────────────────────────────────────────────────────*/}
      {recommendations.length > 0 && (
        <section className="mt-5 animate-rise-in delay-300">
          <div className="rounded-3xl border-2 border-border/60 bg-background p-5 shadow-soft">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-soft">
                  <HeartPulse className="h-4 w-4 text-amber-warm" />
                </span>
                <p className="font-display text-base font-bold text-foreground">도움 받을 수 있는 곳</p>
              </div>
              {recommendations.length > 1 && (
                <p className="text-xs font-medium text-foreground/45">좌우로 넘기기 →</p>
              )}
            </div>
            <div className="mt-3">
              <RecommendationCarousel items={recommendations as any} />
            </div>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────
       * 7. 빠른 메뉴 — 4개 큰 타일 (시각적 메뉴)
       * ─────────────────────────────────────────────────────────*/}
      <section className="mt-5 animate-rise-in delay-300">
        <h2 className="mb-3 px-1 font-display text-lg font-bold text-foreground">빠른 메뉴</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <QuickTile
            to="/local"
            label="동네정보"
            sub="복지관·행사"
            icon={<MapPin className="h-6 w-6" />}
            tone="from-rose-soft to-amber-soft text-primary"
          />
          <QuickTile
            to="/community"
            label="이야기방"
            sub="이웃과 소통"
            icon={<MessageCircleHeart className="h-6 w-6" />}
            tone="from-sage-soft to-emerald-50 text-sage"
          />
          <QuickTile
            to="/home/invite"
            label="가족 초대"
            sub="안부 함께 보기"
            icon={<Send className="h-6 w-6" />}
            tone="from-amber-soft to-rose-soft text-amber-warm"
          />
          <QuickTile
            to="/home/me"
            label="내 정보"
            sub="설정 · 칭호"
            icon={<HeartPulse className="h-6 w-6" />}
            tone="from-primary/15 to-primary/5 text-primary"
          />
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────
       * 8. 하단 — 자세히 보기 (이번 주 / 자세히 탭)
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
          <p className="mt-6 px-2 text-center text-sm text-foreground/55">
            오늘 안부 통화를 잘 마치셨어요 🌷
          </p>
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

/* ── 빠른 메뉴 타일 ───────────────────────────────────── */
function QuickTile({
  to,
  label,
  sub,
  icon,
  tone,
}: {
  to: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <Link
      to={to as "/local"}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-3xl border-2 border-border/60 bg-background p-4 shadow-soft transition active:scale-[0.98] hover:border-primary/40"
    >
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br shadow-soft",
          tone,
        )}
      >
        {icon}
      </span>
      <div>
        <p className="font-display text-base font-bold text-foreground group-hover:text-primary">
          {label}
        </p>
        <p className="mt-0.5 text-xs text-foreground/55">{sub}</p>
      </div>
      <ChevronRight className="absolute right-3 top-3 h-4 w-4 text-foreground/30" />
    </Link>
  );
}
