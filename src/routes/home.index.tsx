import { useEffect, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTodayCheckin, useInvalidateTodayCheckin } from "@/lib/checkin/use-today-checkin";
import { CheckinOverview } from "@/components/checkin/CheckinOverview";
import { RecommendationCarousel } from "@/components/checkin/RecommendationCarousel";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { ANALYTICS_EVENTS } from "@/lib/analytics/eventNames";

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
      {/* 인사 */}
      <section className="px-1 pt-1 animate-rise-in">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary/70 mb-1">
          {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
        </p>
        <h1 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
          {greeting},{" "}
          <span className="text-primary">{user?.nickname ?? "어머님"}</span>님
        </h1>
        <p className="mt-1.5 text-base text-foreground/55">
          오늘 한 번, 안부를 말로 들려주세요.
        </p>
      </section>

      {/* 1. 오늘 안부 말하기 — 항상 최상단 */}
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
      </section>

      {/* 2. 탭 — 오늘 / 이번 주 / 자세히 */}
      <nav
        className="mt-8 grid grid-cols-3 gap-1.5 rounded-2xl bg-surface p-1.5 animate-rise-in delay-200"
        role="tablist"
        aria-label="건강 정보"
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
                "flex min-h-[60px] flex-col items-center justify-center rounded-xl px-2 transition-all duration-200",
                active
                  ? "bg-background text-foreground shadow-soft"
                  : "text-foreground/50 hover:text-foreground/75 hover:bg-background/50",
              )}
            >
              <span className={cn("text-base leading-tight", active ? "font-bold text-foreground" : "font-semibold")}>
                {t.label}
              </span>
              <span className={cn("mt-0.5 text-xs transition-colors", active ? "text-primary/70 font-medium" : "text-foreground/40")}>
                {t.sub}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 3. 탭 본문 */}
      {tab === "today" && (
        <section className="mt-6 space-y-4 animate-rise-in" role="tabpanel">
          {/* 도움 받을 수 있는 곳 */}
          {(today?.recommendations?.length ?? 0) > 0 && (
            <div className="rounded-3xl border border-border/60 bg-background p-6 shadow-soft">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary/80">
                  도움 받을 수 있는 곳
                </p>
                {(today?.recommendations?.length ?? 0) > 1 && (
                  <p className="text-xs font-medium text-foreground/45">
                    좌우로 넘겨보세요
                  </p>
                )}
              </div>
              <div className="mt-3">
                <RecommendationCarousel items={(today?.recommendations ?? []) as any} />
              </div>
              <Button asChild size="lg" variant="outline" className="mt-5 h-14 w-full justify-between rounded-2xl text-base font-semibold">
                <Link to="/local">
                  <span>동네정보 더 보기</span>
                  <ChevronRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          )}

          {/* 가족에게 보내기 */}
          <Button asChild size="lg" variant="outline" className="h-14 w-full justify-between rounded-2xl text-base border-border/60 shadow-soft">
            <Link to="/home/invite">
              <span className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" /> 가족에게 보내기
              </span>
              <ChevronRight className="h-5 w-5 text-foreground/40" />
            </Link>
          </Button>
        </section>
      )}

      {tab === "week" && (
        <section className="mt-6 animate-rise-in" role="tabpanel">
          <CheckinOverview
            enabled={isAuthenticated}
            todayCheckin={today?.checkin ?? null}
            todayReport={today?.report ?? null}
            todayRecommendations={today?.recommendations ?? []}
            view="week"
          />
        </section>
      )}

      {tab === "details" && (
        <section className="mt-6 animate-rise-in" role="tabpanel">
          <CheckinOverview
            enabled={isAuthenticated}
            todayCheckin={today?.checkin ?? null}
            todayReport={today?.report ?? null}
            todayRecommendations={today?.recommendations ?? []}
            view="details"
          />
        </section>
      )}
    </SeniorAppLayout>
  );
}
