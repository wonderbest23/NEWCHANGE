import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  HeartHandshake,
  HeartPulse,
  Moon,
  Pill,
  ShieldCheck,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { RecommendationCarousel } from "@/components/checkin/RecommendationCarousel";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { cn } from "@/lib/utils";
import {
  getDailyMixedRecommendations,
  REC_PRIORITY_LABEL,
  resolveEmotion,
  sortRecommendationsByCondition,
} from "@/lib/checkin/emotion";
import { getCheckinSummary } from "@/lib/checkin/checkin-actions";
import {
  getDailyEmotionRecommendations,
  recordEmotionRecFeedback,
} from "@/lib/checkin/emotion-rec-actions";
import { toast } from "sonner";

export type AxisStatus = "good" | "watch" | "unknown";
type DayLevel = "good" | "normal" | "caution" | "urgent" | "none";

interface CheckinRow {
  id?: string;
  checkin_at?: string;
  condition_level: string;
  summary?: string | null;
  meal_status?: string | null;
  sleep_status?: string | null;
  medicine_status?: string | null;
  pain_status?: string | null;
  mood_status?: string | null;
  urgent_detected?: boolean | null;
  loneliness_detected?: boolean | null;
  dizziness_detected?: boolean | null;
}

interface CheckinOverviewProps {
  enabled: boolean;
  todayCheckin?: CheckinRow | null;
  todayReport?: { senior_report_text?: string | null } | null;
  todayRecommendations?: unknown[];
  /** 어떤 묶음만 보일지 — 홈 탭별 분리용. 기본값 'all' = 기존 전체 출력 */
  view?: "all" | "today" | "week" | "details";
  /** 감정 기반 권고 노출 개수 기준값 */
  maxRecs?: number;
}

const STATUS_LABEL: Record<AxisStatus, string> = {
  good: "안정적",
  watch: "살펴보기",
  unknown: "기록 없음",
};

const STATUS_DOT: Record<AxisStatus, string> = {
  good: "bg-sage",
  watch: "bg-amber-warm",
  unknown: "bg-muted-foreground/30",
};

const LEVEL_LABEL: Record<DayLevel, string> = {
  good: "양호",
  normal: "보통",
  caution: "주의",
  urgent: "주의 필요",
  none: "기록 없음",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const LEVEL_DOT: Record<DayLevel, string> = {
  good: "bg-sage",
  normal: "bg-amber-warm/70",
  caution: "bg-amber-warm",
  urgent: "bg-primary",
  none: "bg-muted",
};

const LEVEL_BG: Record<DayLevel, string> = {
  good: "bg-sage/15 text-sage border-sage/30",
  normal: "bg-amber-warm/10 text-amber-warm border-amber-warm/30",
  caution: "bg-amber-warm/20 text-amber-warm border-amber-warm/40",
  urgent: "bg-primary/10 text-primary border-primary/30",
  none: "bg-muted/30 text-foreground/40 border-border/40",
};

type RecItem = {
  priority: "now" | "soon" | "keep";
  text: string;
  hint?: string;
  evidence?: string;
  author?: string;
  kind?: "action" | "book" | "quote" | "meditation" | "place" | "music" | "content";
};

function emotionRecKstDateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function EmotionRecommendationCollection({
  condition,
  mood,
  fusedEmotionKey,
  voiceAnalysisSource,
  checkinId,
  className,
  title = "감정 기반 권고 모음",
  caption,
  limit = 4,
}: {
  condition?: string | null;
  mood?: string | null;
  /** SER·prosody 융합 감정 (있으면 텍스트-only보다 우선) */
  fusedEmotionKey?: import("@/lib/checkin/emotion").EmotionKey | null;
  voiceAnalysisSource?: string | null;
  checkinId?: string | null;
  className?: string;
  title?: string;
  caption?: string;
  limit?: number;
}) {
  const emotion = resolveEmotion(
    (condition ?? null) as any,
    mood ?? null,
    fusedEmotionKey ?? null,
  );
  const dateKey = emotionRecKstDateKey();
  const conditionLevel = (condition ?? undefined) as
    | "good"
    | "normal"
    | "caution"
    | "urgent"
    | undefined;

  const [feedbackSent, setFeedbackSent] = useState<"helpful" | "not_helpful" | null>(null);
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState("");

  const fallbackItems = useMemo(
    () =>
      sortRecommendationsByCondition(
        getDailyMixedRecommendations(emotion.key, limit),
        condition,
      ),
    [emotion.key, limit, condition],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ["emotion-rec-daily", emotion.key, dateKey, conditionLevel, mood ?? ""],
    queryFn: async () =>
      getDailyEmotionRecommendations({
        data: {
          emotionKey: emotion.key,
          conditionLevel,
          moodStatus: mood ?? null,
        },
        headers: await authHeaders(),
      } as Parameters<typeof getDailyEmotionRecommendations>[0]),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const items = (
    !isError && data?.items?.length ? data.items : fallbackItems
  ).slice(0, limit);

  const submitFeedback = async (helpful: boolean, comment?: string) => {
    if (feedbackSent || feedbackPending) return;
    setFeedbackPending(true);
    try {
      const res = await recordEmotionRecFeedback({
        data: {
          emotionKey: emotion.key,
          helpful,
          source: data?.source,
          cacheKey: data?.cacheKey,
          checkinId: checkinId ?? null,
          comment: comment?.trim() || null,
        },
        headers: await authHeaders(),
      } as Parameters<typeof recordEmotionRecFeedback>[0]);
      if (res.ok) {
        setFeedbackSent(helpful ? "helpful" : "not_helpful");
        setShowCommentForm(false);
        toast.success(helpful ? "소중한 의견 감사해요." : "의견을 남겨 주셔서 감사해요.");
      }
    } catch {
      toast.error("의견 전달에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setFeedbackPending(false);
    }
  };

  const toneByPriority: Record<string, string> = {
    now: "border-primary/40 bg-primary/5 text-primary",
    soon: "border-amber-warm/50 bg-amber-warm/10 text-amber-warm",
    keep: "border-sage/40 bg-sage/10 text-sage",
  };

  if (!isLoading && items.length === 0) return null;

  return (
    <section className={cn("w-full rounded-2xl border border-border/70 bg-background p-5 text-left shadow-soft", className)}>
      <div className="text-left">
        <h3 className="text-left font-display text-base font-bold text-foreground">{title}</h3>
        <p className="mt-1 text-left text-sm leading-relaxed text-foreground/65">
          {caption ?? (
            <>
              {voiceAnalysisSource === "multimodal" || voiceAnalysisSource === "ser" ? (
                <>
                  오늘 말씀과 <span className="font-semibold text-foreground/80">목소리 패턴</span>을 함께 참고해{" "}
                  <span className={cn("font-bold", emotion.textTone)}>{emotion.label}</span> 신호에 맞춰 골랐어요.
                </>
              ) : (
                <>
                  오늘 분석된 <span className={cn("font-bold", emotion.textTone)}>{emotion.label}</span> 신호에 맞춰 카테고리별로 하나씩 골랐어요.
                </>
              )}
            </>
          )}
        </p>
      </div>

      {isLoading ? (
        <p className="mt-4 rounded-xl border border-dashed border-border/60 bg-surface/40 px-4 py-8 text-center text-sm text-foreground/55">
          오늘 맞춤 권고를 준비하고 있어요…
        </p>
      ) : (
        <EmotionRecommendationSlider
          className="mt-4"
          items={items}
          toneByPriority={toneByPriority}
          showCategoryTabs
          showEvidence
        />
      )}

      <p className="mt-4 text-center text-xs leading-relaxed text-foreground/50">
        일반 생활 가이드입니다. 통증이나 불편이 계속되면 보호자나 의료 전문가와 상의해 주세요.
      </p>

      {!isLoading && items.length > 0 && (
        <div className="mt-4 border-t border-border/50 pt-4">
          <p className="text-center text-sm font-medium text-foreground/70">
            이 권고가 도움이 되셨나요?
          </p>
          {feedbackSent ? (
            <p className="mt-2 text-center text-xs text-foreground/50">의견을 남겨 주셔서 감사해요.</p>
          ) : showCommentForm ? (
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-medium text-foreground/60">
                어떤 점이 아쉬웠는지 알려주세요 (선택)
              </label>
              <textarea
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="예: 내용이 너무 길어요, 다른 종류도 보고 싶어요"
                className="w-full resize-none rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/40"
              />
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  disabled={feedbackPending}
                  onClick={() => submitFeedback(false, feedbackComment)}
                  className="rounded-full border border-primary/40 bg-primary/10 px-5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-50"
                >
                  보내기
                </button>
                <button
                  type="button"
                  disabled={feedbackPending}
                  onClick={() => submitFeedback(false)}
                  className="rounded-full border border-border/60 px-4 py-2 text-sm text-foreground/60 hover:bg-muted disabled:opacity-50"
                >
                  건너뛰기
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                disabled={feedbackPending}
                onClick={() => submitFeedback(true)}
                className="rounded-full border border-sage/40 bg-sage/10 px-5 py-2 text-sm font-semibold text-sage transition hover:bg-sage/20 disabled:opacity-50"
              >
                네, 도움 됐어요
              </button>
              <button
                type="button"
                disabled={feedbackPending}
                onClick={() => setShowCommentForm(true)}
                className="rounded-full border border-border/60 bg-surface/60 px-5 py-2 text-sm font-semibold text-foreground/70 transition hover:bg-muted disabled:opacity-50"
              >
                아니오
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function classifyAxis(values: (string | null | undefined)[], watchTokens: string[]): AxisStatus {
  const vals = values.filter(Boolean) as string[];
  if (vals.length === 0) return "unknown";
  return vals.some((v) => watchTokens.some((t) => v.includes(t))) ? "watch" : "good";
}

export function CheckinOverview({
  enabled,
  todayCheckin,
  todayReport,
  todayRecommendations = [],
  view = "all",
  maxRecs = 3,
}: CheckinOverviewProps) {
  const showToday = view === "all" || view === "today";
  const showWeek = view === "all" || view === "week";
  const showDetails = view === "all" || view === "details";
  const { data: weekData, isLoading: weekLoading } = useQuery({
    queryKey: ["checkin-summary", "week"],
    queryFn: async () => getCheckinSummary({ data: { range: "week" }, headers: await authHeaders() }),
    enabled,
  });
  const { data: monthData } = useQuery({
    queryKey: ["checkin-summary", "month"],
    queryFn: async () => getCheckinSummary({ data: { range: "month" }, headers: await authHeaders() }),
    enabled,
  });

  const weekItems = (weekData?.items ?? []) as CheckinRow[];
  const monthItems = (monthData?.items ?? []) as CheckinRow[];

  const { axes, latest } = useMemo(() => {
    const latest = weekItems[weekItems.length - 1] ?? null;
    const meals = weekItems.map((r) => r.meal_status);
    const sleeps = weekItems.map((r) => r.sleep_status);
    const meds = weekItems.map((r) => r.medicine_status);

    const axes = [
      {
        key: "body",
        label: "몸 상태",
        status: classifyAxis([latest?.condition_level], ["caution", "urgent"]),
      },
      {
        key: "meal",
        label: "식사",
        status: classifyAxis(meals, ["부족", "미체크", "거름"]),
      },
      {
        key: "med",
        label: "약 복용",
        status: classifyAxis(meds, ["확인필요", "안먹음", "미복용"]),
      },
      {
        key: "sleep",
        label: "수면",
        status: classifyAxis(sleeps, ["불편", "못잠", "자주깸"]),
      },
      {
        key: "activity",
        label: "활동",
        status: (weekItems.length === 0 ? "unknown" : weekItems.length < 3 ? "watch" : "good") as AxisStatus,
      },
      {
        key: "fall",
        label: "어지럼·낙상",
        status: ((): AxisStatus => {
          const dizzy = weekItems.some((r) => r.dizziness_detected);
          if (dizzy) return "watch";
          return weekItems.length === 0 ? "unknown" : "good";
        })(),
      },
      {
        key: "social",
        label: "대화",
        status: ((): AxisStatus => {
          const lonely = weekItems.filter((r) => r.loneliness_detected).length;
          if (lonely >= 2) return "watch";
          return weekItems.length === 0 ? "unknown" : "good";
        })(),
      },
    ];
    return { axes, latest };
  }, [weekItems]);

  const watchCount = axes.filter((a) => a.status === "watch").length;

  const weekly = useMemo(() => {
    return {
      done: weekItems.length,
      total: 7,
      dizzy: weekItems.filter((r) => r.dizziness_detected).length,
    };
  }, [weekItems]);

  const suggestions = useMemo(() => {
    const out: string[] = [];
    const find = (k: string) => axes.find((a) => a.key === k);
    if (find("sleep")?.status === "watch") out.push("저녁에는 카페인을 피하고, 잠들기 30분 전 휴대폰을 줄여보세요.");
    if (find("meal")?.status === "watch") out.push("물 한 잔과 가벼운 식사를 챙겨보세요.");
    if (find("med")?.status === "watch") out.push("오늘 약 복용을 한 번 더 확인해보세요. 임의 중단은 피해주세요.");
    if (find("activity")?.status !== "good") out.push("괜찮으시면 집 안에서 5~10분 가볍게 움직여보세요.");
    if (find("social")?.status === "watch") out.push("우리 동네 이야기방에 짧게 인사를 남겨보세요.");
    if (find("fall")?.status === "watch") out.push("오늘은 무리한 외출을 피하고, 어지러움이 반복되면 보호자에게 알려주세요.");
    if (out.length === 0) out.push("오늘도 잘 지내고 계세요. 충분한 수분 섭취 잊지 마세요.");
    return out;
  }, [axes]);

  const weekEmotionSource = todayCheckin ?? weekItems[weekItems.length - 1] ?? null;

  return (
    <section id="health-overview" className={cn(view === "all" && "mt-8 scroll-mt-24")}>
      {view === "all" && (
        <h2 className="font-display text-fluid-3xl text-foreground">건강 기록</h2>
      )}

      {showToday && (
      <>
      {todayReport?.senior_report_text && (
        <div className="mt-5 border-t-2 border-border/70 pt-6">
          <p className="text-fluid-base font-semibold uppercase tracking-[0.14em] text-primary/80">
            곁이 정리한 한마디
          </p>
          <p className="mt-4 text-fluid-2xl leading-relaxed text-foreground text-base">
            {todayReport.senior_report_text}
          </p>

          {todayRecommendations.length > 0 && (
            <div className="mt-8">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-fluid-base font-semibold uppercase tracking-[0.14em] text-primary/80">
                  도움 받을 수 있는 곳
                </p>
                {todayRecommendations.length > 1 && (
                  <p className="text-fluid-sm font-medium tabular-nums text-foreground/60">
                    좌우로 넘겨보세요
                  </p>
                )}
              </div>

              <RecommendationCarousel items={todayRecommendations as any} />

              <Button asChild size="lg" variant="outline" className="mt-5 h-14 w-full justify-between rounded-2xl text-fluid-base font-semibold">
                <Link to="/local">
                  <span>동네정보 더 보기</span>
                  <ChevronRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      )}

      </>
      )}

      {showWeek && (
        <section className={cn(view === "week" ? "" : "mt-10")}>
          <h3 className="font-display text-fluid-3xl text-foreground">이번 주 한눈에</h3>
          {weekLoading && weekItems.length === 0 ? (
            <p className="mt-4 text-fluid-base text-foreground/60">기록을 불러오고 있어요.</p>
          ) : (
            <dl className="mt-6 divide-y-2 divide-border/60">
              {[
                { k: "건강 체크", v: `${weekly.done} / ${weekly.total}일`, alert: weekly.done < 3 },
                { k: "살펴볼 지표", v: `${watchCount}개`, alert: watchCount >= 2 },
                { k: "어지럼·낙상", v: `${weekly.dizzy}회`, alert: weekly.dizzy > 0 },
              ].map((row) => (
                <div key={row.k} className="flex items-baseline justify-between py-5">
                  <dt className="text-fluid-lg text-foreground/80">{row.k}</dt>
                  <dd className={cn("text-fluid-xl font-bold tabular-nums", row.alert ? "text-primary" : "text-foreground")}>{row.v}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* 이번 주 지표 기반 권고 — week 탭에서만 별도로 노출 */}
          {view === "week" && suggestions[0] && (
            <div className="mt-8 rounded-3xl border-2 border-border/70 bg-surface-elevated p-6">
              <p className="text-fluid-base font-semibold uppercase tracking-[0.14em] text-primary/80">
                이번 주 살펴볼 점
              </p>
              <ul className="mt-4 space-y-2.5">
                {suggestions.map((s, i) => (
                  <li key={i} className="text-fluid-lg leading-relaxed text-foreground/85">
                    • {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 이번 주 탭 — 최근 안부·오늘 기록 기준 AI 맞춤 권고 */}
          {view === "week" && weekEmotionSource && (
            <EmotionRecommendationCollection
              className="mt-8"
              title="맞춤 감정 권고"
              caption={`${resolveEmotion(weekEmotionSource.condition_level as any, weekEmotionSource.mood_status).label} 신호에 맞춰 골랐어요`}
              condition={weekEmotionSource.condition_level}
              mood={weekEmotionSource.mood_status}
              checkinId={todayCheckin?.id ?? weekEmotionSource.id}
            />
          )}
        </section>
      )}

      {showDetails && (
        <section className={cn(view === "details" ? "" : "mt-10")}>
          {view === "all" ? (
            <details className="group border-t-2 border-border/70 pt-6">
              <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between py-3 text-fluid-lg font-semibold text-foreground/80 hover:text-foreground">
                <span>자세히 보기</span>
                <ChevronDown className="h-6 w-6 text-foreground/50 transition-transform group-open:rotate-180" />
              </summary>
              <DetailsBody
                axes={axes}
                monthItems={monthItems}
                emotionSource={weekEmotionSource}
                checkinId={todayCheckin?.id ?? weekEmotionSource?.id}
              />
            </details>
          ) : (
            <DetailsBody
              axes={axes}
              monthItems={monthItems}
              emotionSource={weekEmotionSource}
              checkinId={todayCheckin?.id ?? weekEmotionSource?.id}
            />
          )}
        </section>
      )}

    </section>
  );
}

function DetailsBody({
  axes,
  monthItems,
  emotionSource,
  checkinId,
}: {
  axes: { key: string; label: string; status: AxisStatus }[];
  monthItems: CheckinRow[];
  emotionSource?: CheckinRow | null;
  checkinId?: string | null;
}) {
  return (
    <>
      <div className="mt-8">
        <h3 className="font-display text-fluid-2xl text-foreground">오늘 살펴볼 7가지</h3>
        <HealthAxisTicker axes={axes} />
      </div>

      {emotionSource && (
        <EmotionRecommendationCollection
          className="mt-10"
          title="맞춤 감정 권고"
          caption={`${resolveEmotion(emotionSource.condition_level as any, emotionSource.mood_status).label} 신호에 맞춰 골랐어요`}
          condition={emotionSource.condition_level}
          mood={emotionSource.mood_status}
          checkinId={checkinId}
        />
      )}

      <div className="mt-10">
        <h3 className="font-display text-fluid-2xl text-foreground">최근 30일</h3>
        <MonthlyCheckinCalendar items={monthItems} />
      </div>
    </>
  );
}

const KST_DATE_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

function getKstDateKey(year: number, month: number, day: number) {
  return KST_DATE_FMT.format(
    new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+09:00`),
  );
}

function getKstWeekday(year: number, month: number, day: number) {
  const dt = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+09:00`);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short" }).format(dt);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[name] ?? 0;
}

function countDaysInKstMonth(year: number, month: number) {
  for (let d = 31; d >= 28; d--) {
    const key = getKstDateKey(year, month, d);
    const [, m, day] = key.split("-").map(Number);
    if (m === month && day === d) return d;
  }
  return 30;
}

function dayLevelFromRecord(record?: CheckinRow | null): DayLevel {
  if (!record?.condition_level) return "none";
  return record.condition_level as DayLevel;
}

type CalendarCell =
  | { type: "empty" }
  | {
      type: "day";
      date: string;
      day: number;
      level: DayLevel;
      inWindow: boolean;
      isToday: boolean;
      record: CheckinRow | null;
    };

function MonthlyCheckinCalendar({ items }: { items: CheckinRow[] }) {
  const todayKey = KST_DATE_FMT.format(new Date());
  const [ty, tm] = todayKey.split("-").map(Number);

  const windowStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return KST_DATE_FMT.format(d);
  }, []);

  const recordByDay = useMemo(() => {
    const map = new Map<string, CheckinRow>();
    for (const r of items) {
      if (!r.checkin_at) continue;
      const key = KST_DATE_FMT.format(new Date(r.checkin_at));
      const prev = map.get(key);
      if (!prev || new Date(r.checkin_at) > new Date(prev.checkin_at!)) {
        map.set(key, r);
      }
    }
    return map;
  }, [items]);

  const [viewYear, setViewYear] = useState(ty);
  const [viewMonth, setViewMonth] = useState(tm);
  const [selected, setSelected] = useState<string | null>(todayKey);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
    const t = window.setTimeout(() => setRevealed(true), 650);
    return () => window.clearTimeout(t);
  }, [viewYear, viewMonth]);

  const monthLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
  }).format(new Date(`${viewYear}-${String(viewMonth).padStart(2, "0")}-01T12:00:00+09:00`));

  const cells = useMemo(() => {
    const daysInMonth = countDaysInKstMonth(viewYear, viewMonth);
    const firstDow = getKstWeekday(viewYear, viewMonth, 1);
    const out: CalendarCell[] = [];
    for (let i = 0; i < firstDow; i++) out.push({ type: "empty" });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = getKstDateKey(viewYear, viewMonth, d);
      const record = recordByDay.get(date) ?? null;
      out.push({
        type: "day",
        date,
        day: d,
        level: dayLevelFromRecord(record),
        inWindow: date >= windowStart && date <= todayKey,
        isToday: date === todayKey,
        record,
      });
    }
    return out;
  }, [viewYear, viewMonth, recordByDay, windowStart, todayKey]);

  const canPrev =
    viewYear > Number(windowStart.slice(0, 4)) ||
    (viewYear === Number(windowStart.slice(0, 4)) && viewMonth > Number(windowStart.slice(5, 7)));
  const canNext = viewYear < ty || (viewYear === ty && viewMonth < tm);

  const goPrev = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNext = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const selectedRecord = selected ? recordByDay.get(selected) ?? null : null;
  const selectedLevel = dayLevelFromRecord(selectedRecord);
  const selectedLabel = selected
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(new Date(`${selected}T12:00:00+09:00`))
    : "";

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-soft">
      {/* 월 헤더 — 슬라이드 인 */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canPrev}
          aria-label="이전 달"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-foreground/60 transition hover:bg-muted disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p
          key={`${viewYear}-${viewMonth}`}
          className="animate-calendar-month-in font-display text-xl font-bold text-foreground"
        >
          {monthLabel}
        </p>
        <button
          type="button"
          onClick={goNext}
          disabled={!canNext}
          aria-label="다음 달"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-foreground/60 transition hover:bg-muted disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* 달력 그리드 */}
      {revealed && (
        <div key={`grid-${viewYear}-${viewMonth}`} className="animate-calendar-grid-in px-3 pb-4 pt-3">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-center text-xs font-semibold text-foreground/45">
                {w}
              </div>
            ))}
            {cells.map((cell, i) => {
              if (cell.type === "empty") {
                return <div key={`empty-${i}`} className="aspect-square" />;
              }
              const isSelected = selected === cell.date;
              const clickable = cell.inWindow;
              return (
                <button
                  key={cell.date}
                  type="button"
                  disabled={!clickable}
                  onClick={() => setSelected(cell.date)}
                  aria-label={`${cell.day}일 ${LEVEL_LABEL[cell.level]}`}
                  aria-pressed={isSelected}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center rounded-xl border text-sm font-semibold transition-all duration-200",
                    clickable ? LEVEL_BG[cell.level] : "border-transparent bg-transparent text-foreground/20",
                    isSelected && clickable && "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.03]",
                    cell.isToday && !isSelected && clickable && "ring-1 ring-sky-400/60",
                  )}
                >
                  <span>{cell.day}</span>
                  {cell.level !== "none" && clickable && (
                    <span className={cn("mt-0.5 h-1.5 w-1.5 rounded-full", LEVEL_DOT[cell.level])} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 선택한 날 요약 */}
      {selected && revealed && (
        <div className="border-t border-border/60 bg-surface/40 px-4 py-4 animate-rise-in">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground/50">선택한 날</p>
          <p className="mt-1 text-lg font-bold text-foreground">{selectedLabel}</p>
          {selectedRecord ? (
            <div className="mt-3 space-y-2.5 rounded-xl border border-border/60 bg-background p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground/60">상태</span>
                <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-bold", LEVEL_BG[selectedLevel])}>
                  {LEVEL_LABEL[selectedLevel]}
                </span>
              </div>
              {selectedRecord.mood_status && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-foreground/60">기분</span>
                  <span className="font-semibold text-foreground">{selectedRecord.mood_status}</span>
                </div>
              )}
              {selectedRecord.meal_status && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-foreground/60">식사</span>
                  <span className="font-semibold text-foreground">{selectedRecord.meal_status}</span>
                </div>
              )}
              {selectedRecord.sleep_status && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-foreground/60">수면</span>
                  <span className="font-semibold text-foreground">{selectedRecord.sleep_status}</span>
                </div>
              )}
              {selectedRecord.medicine_status && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-foreground/60">약 복용</span>
                  <span className="font-semibold text-foreground">{selectedRecord.medicine_status}</span>
                </div>
              )}
              {selectedRecord.summary && (
                <p className="border-t border-border/50 pt-3 text-sm leading-relaxed text-foreground/75">
                  {selectedRecord.summary}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-border/60 bg-background px-4 py-6 text-center text-sm text-foreground/55">
              이 날은 안부 기록이 없어요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function healthAxisIcon(key: string): LucideIcon {
  return {
    body: HeartPulse,
    meal: Utensils,
    med: Pill,
    sleep: Moon,
    activity: Dumbbell,
    fall: ShieldCheck,
    social: HeartHandshake,
  }[key] ?? Activity;
}

function HealthAxisTicker({
  axes,
}: {
  axes: { key: string; label: string; status: AxisStatus }[];
}) {
  const [active, setActive] = useState(0);
  const current = axes[active] ?? axes[0];

  useEffect(() => {
    if (axes.length < 2) return;
    const id = window.setInterval(() => {
      setActive((v) => (v + 1) % axes.length);
    }, 3600);
    return () => window.clearInterval(id);
  }, [axes.length]);

  if (!current) return null;

  const CurrentIcon = healthAxisIcon(current.key);

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-border/70 bg-background p-5 shadow-soft">
      <div
        key={`${current.key}-${active}`}
        className="animate-axis-slide"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CurrentIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tabular-nums text-foreground/50">
              {active + 1} / {axes.length}
            </p>
            <p className="mt-0.5 text-2xl font-bold leading-tight text-foreground sm:text-3xl">
              {current.label}
            </p>
          </div>
          <span className={cn("h-4 w-4 shrink-0 rounded-full", STATUS_DOT[current.status])} />
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-surface px-4 py-3">
          <span className="text-sm font-medium text-foreground/60">상태</span>
          <span className="text-xl font-bold text-foreground">
            {STATUS_LABEL[current.status]}
          </span>
        </div>
      </div>

      {/* 지표별 아이콘 탭 */}
      <div
        className="mt-4 flex justify-between gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="오늘 살펴볼 항목"
      >
        {axes.map((a, i) => {
          const Icon = healthAxisIcon(a.key);
          const isActive = i === active;
          return (
            <button
              key={a.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`${a.label} 보기`}
              onClick={() => setActive(i)}
              className={cn(
                "flex shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-2 transition-all duration-200",
                isActive ? "bg-primary/10 text-primary" : "text-foreground/45 hover:text-foreground/70",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "bg-surface",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className={cn("max-w-[3rem] truncate text-[10px] font-semibold leading-none", isActive && "text-primary")}>
                {a.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function recommendationKindLabel(kind: RecItem["kind"]) {
  return {
    action: "실천",
    book: "책",
    quote: "문장",
    meditation: "명상",
    place: "장소",
    music: "음악",
    content: "콘텐츠",
  }[kind ?? "action"];
}

function recommendationSourceLabel(item: RecItem) {
  if (item.kind === "book") {
    return item.author ? `도서 출처 · ${item.text} / ${item.author}` : `도서 출처 · ${item.text}`;
  }
  if (item.kind === "quote") {
    return item.author ? `문장 출처 · ${item.author}` : "문장 출처 · 작자 미상";
  }
  if (item.kind === "place") {
    return item.author ? `장소 정보 · ${item.author}` : null;
  }
  if (item.kind === "music") {
    return "음악 추천";
  }
  if (item.kind === "content") {
    return item.author ? `콘텐츠 출처 · ${item.author}` : "콘텐츠 추천";
  }
  return null;
}

function recommendationWhyLabel(item: RecItem) {
  if (item.hint) return item.hint;
  if (item.kind === "book") return "이번 감정 흐름을 천천히 정리하는 데 도움이 되는 읽을거리예요.";
  if (item.kind === "quote") return "짧게 읽고 마음을 환기하기 좋은 문장이에요.";
  if (item.kind === "meditation") return "호흡과 몸의 긴장을 낮추는 데 초점을 둔 방법이에요.";
  if (item.kind === "place") return "가볍게 움직이며 기분을 바꾸기 좋은 장소예요.";
  if (item.kind === "music") return "호흡을 고르게 하고 마음을 가라앉히기 좋은 음악이에요.";
  if (item.kind === "content") return "오늘 상태와 연결해 부담 없이 참고할 수 있는 자료예요.";
  return "오늘 상태에서 무리 없이 바로 시도할 수 있는 작은 행동이에요.";
}

function recommendationEvidenceLabel(item: RecItem) {
  if (item.evidence) return item.evidence;
  if (item.kind === "action" || item.kind === "meditation") {
    return "비약물적 정서 안정 권고: 호흡, 휴식, 가벼운 활동, 사회적 연결 중심";
  }
  return null;
}

function EmotionRecommendationSlider({
  items,
  toneByPriority,
  className,
  showEvidence = false,
  showCategoryTabs = false,
}: {
  items: RecItem[];
  toneByPriority: Record<string, string>;
  className?: string;
  showEvidence?: boolean;
  showCategoryTabs?: boolean;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setActive(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  if (items.length === 0) return null;

  const activeItem = items[active];

  return (
    <div className={className}>
      {/* 카테고리 탭 */}
      {showCategoryTabs && items.length > 1 && (
        <div
          className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="권고 카테고리"
        >
          {items.map((item, i) => {
            const isActive = active === i;
            return (
              <button
                key={`${item.kind}-${i}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => api?.scrollTo(i)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold transition-all duration-200",
                  isActive
                    ? "border-primary/50 bg-primary text-primary-foreground shadow-sm"
                    : "border-border/60 bg-surface/60 text-foreground/70 hover:border-border hover:text-foreground",
                )}
              >
                {recommendationKindLabel(item.kind)}
              </button>
            );
          })}
        </div>
      )}

      {/* 슬라이드 카드 */}
      <Carousel
        setApi={setApi}
        opts={{ align: "start", loop: items.length > 1, duration: 30 }}
        className="mt-3"
      >
        <CarouselContent className="-ml-0">
          {items.map((item, i) => {
            const sourceLabel = recommendationSourceLabel(item);
            const evidenceLabel = recommendationEvidenceLabel(item);

            return (
              <CarouselItem key={`${item.kind ?? "action"}-${i}`} className="pl-0">
                <article className="overflow-hidden rounded-2xl border border-border/70 bg-surface/40 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {!showCategoryTabs && (
                      <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold text-foreground/70">
                        {recommendationKindLabel(item.kind)}
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold",
                        toneByPriority[item.priority] ?? toneByPriority.keep,
                      )}
                    >
                      {REC_PRIORITY_LABEL[item.priority]}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-bold leading-snug text-foreground">
                    {item.text}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-foreground/70">
                    <span className="font-semibold text-foreground/85">왜 추천하나요? </span>
                    {recommendationWhyLabel(item)}
                  </p>
                  {sourceLabel && (
                    <p className="mt-3 rounded-xl bg-background px-3 py-2.5 text-sm font-medium text-foreground/65">
                      {sourceLabel}
                    </p>
                  )}
                  {showEvidence && evidenceLabel && (
                    <p className="mt-2 text-xs leading-relaxed text-foreground/45">
                      근거: {evidenceLabel}
                    </p>
                  )}
                </article>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>

      {/* 이전 / 다음 */}
      {items.length > 1 && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => api?.scrollPrev()}
            disabled={active === 0 && !api?.canScrollPrev()}
            aria-label="이전 권고"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-foreground/60 transition hover:bg-muted active:scale-95 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <p className="text-sm font-medium tabular-nums text-foreground/60">
            {showCategoryTabs ? (
              <span>{active + 1} / {items.length}</span>
            ) : (
              <>
                {recommendationKindLabel(activeItem?.kind)}
                <span className="mx-1.5 text-foreground/35">·</span>
                <span>{active + 1} / {items.length}</span>
              </>
            )}
          </p>

          <button
            type="button"
            onClick={() => api?.scrollNext()}
            disabled={active === items.length - 1 && !api?.canScrollNext()}
            aria-label="다음 권고"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-foreground/60 transition hover:bg-muted active:scale-95 disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
