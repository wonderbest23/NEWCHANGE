import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Coffee,
  Dumbbell,
  HeartHandshake,
  Moon,
  Music,
  Pill,
  ShieldCheck,
  Sparkles,
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
import { BadgesSection } from "@/components/settings/BadgesSection";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { cn } from "@/lib/utils";
import {
  getEmotionRecommendationsByCadence,
  REC_PRIORITY_LABEL,
  resolveEmotion,
} from "@/lib/checkin/emotion";
import { getCheckinSummary } from "@/lib/checkin/checkin-actions";

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

const LEVEL_DOT: Record<DayLevel, string> = {
  good: "bg-sage",
  normal: "bg-amber-warm/70",
  caution: "bg-amber-warm",
  urgent: "bg-primary",
  none: "bg-muted",
};

type RecItem = {
  priority: "now" | "soon" | "keep";
  text: string;
  hint?: string;
  evidence?: string;
  author?: string;
  kind?: "action" | "book" | "quote" | "meditation" | "place" | "music" | "content";
};

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

  const calendar = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
    const map = new Map<string, DayLevel>();
    for (const r of monthItems) {
      if (!r.checkin_at) continue;
      const d = fmt.format(new Date(r.checkin_at));
      const order: DayLevel[] = ["good", "normal", "caution", "urgent"];
      const prev = map.get(d) ?? "none";
      const next = r.condition_level as DayLevel;
      const winner = prev === "none" ? next : order.indexOf(next) > order.indexOf(prev) ? next : prev;
      map.set(d, winner);
    }
    const days: { date: string; level: DayLevel; label: string }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = fmt.format(d);
      days.push({
        date: key,
        level: map.get(key) ?? "none",
        label: `${d.getMonth() + 1}/${d.getDate()}`,
      });
    }
    return days;
  }, [monthItems]);

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

  const emotion = resolveEmotion((todayCheckin?.condition_level ?? null) as any, todayCheckin?.mood_status ?? null);
  const recsByCadence = todayCheckin ? getEmotionRecommendationsByCadence(emotion.key) : null;
  const weeklyEmotionRecs = recsByCadence?.weekly.slice(0, Math.max(4, maxRecs)) ?? [];
  const toneByPriority: Record<string, string> = {
    now: "border-primary/40 bg-primary/5 text-primary",
    soon: "border-amber-warm/50 bg-amber-warm/10 text-amber-warm",
    keep: "border-sage/40 bg-sage/10 text-sage",
  };

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

          {/* 이번 주 감정 기반 권고 (논문 근거) */}
          {view === "week" && weeklyEmotionRecs.length > 0 && (
            <CadenceRecBlock
              title="이번 주 감정 권고"
              caption={`${emotion.label} 신호 기반`}
              items={weeklyEmotionRecs}
              toneByPriority={toneByPriority}
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
              <DetailsBody axes={axes} calendar={calendar} />
            </details>
          ) : (
            <>
              <DetailsBody axes={axes} calendar={calendar} />

              {/* 자세히 탭 — 이번 주 감정 권고만 노출 */}
              {weeklyEmotionRecs.length > 0 && (
                <div className="mt-10">
                  <h3 className="font-display text-fluid-2xl text-foreground">
                    감정 기반 권고 모음
                  </h3>
                  <p className="mt-2 text-fluid-base text-foreground/65">
                    오늘 분석된 <span className={cn("font-semibold", emotion.textTone)}>{emotion.label}</span> 신호를 바탕으로, 이번 주에 해볼 만한 것만 모았어요.
                  </p>
                  <CadenceRecBlock
                    title="이번 주"
                    items={weeklyEmotionRecs}
                    toneByPriority={toneByPriority}
                  />
                  <p className="mt-4 text-fluid-sm text-foreground/55 text-xs text-center font-sans">
                    ※ 일반 가이드입니다. 증상이 지속되면 의료 전문가와 상담해주세요.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      )}

    </section>
  );
}

function DetailsBody({
  axes,
  calendar,
}: {
  axes: { key: string; label: string; status: AxisStatus }[];
  calendar: { date: string; level: DayLevel; label: string }[];
}) {
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

  return (
    <>
      <div className="mt-8">
        <h3 className="font-display text-fluid-2xl text-foreground">건강 지표 7가지</h3>
        <HealthAxisTicker axes={axes} />
      </div>

      <div className="mt-10">
        <h3 className="font-display text-fluid-2xl text-foreground">최근 30일</h3>
        <div className="mt-5 grid grid-cols-10 gap-2">
          {calendar.map((d) => {
            const isToday = d.date === todayKey;
            return (
              <div key={d.date} className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "h-4 w-4 rounded-full",
                    LEVEL_DOT[d.level],
                    isToday && "h-5 w-5 animate-today-ring ring-2 ring-sky-500 ring-offset-2 ring-offset-background",
                  )}
                  title={`${d.label} · ${isToday ? "오늘 · " : ""}${d.level}`}
                  aria-label={`${d.label} ${isToday ? "오늘" : ""}`}
                />
                <span className={cn("text-[11px] tabular-nums text-foreground/55", isToday && "font-bold text-sky-600")}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <BadgesSection />
    </>
  );
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

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-border/70 bg-background p-5 shadow-soft">
      <div
        key={`${current.key}-${active}`}
        className="animate-axis-slide"
        aria-live="polite"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground/50">
              {active + 1} / {axes.length}
            </p>
            <p className="mt-1 text-3xl font-bold leading-tight text-foreground sm:text-4xl">
              {current.label}
            </p>
          </div>
          <span className={cn("h-5 w-5 shrink-0 rounded-full", STATUS_DOT[current.status])} />
        </div>
        <div className="mt-5 flex items-center justify-between rounded-xl bg-surface px-4 py-3">
          <span className="text-base font-medium text-foreground/60">상태</span>
          <span className="text-2xl font-bold text-foreground">
            {STATUS_LABEL[current.status]}
          </span>
        </div>
      </div>

      <div className="mt-5 flex justify-center gap-2">
        {axes.map((a, i) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`${a.label} 보기`}
            className="flex h-8 w-8 items-center justify-center"
          >
            <span
              className={cn(
                "rounded-full transition-all duration-300",
                i === active ? "h-2.5 w-7 bg-primary" : "h-2.5 w-2.5 bg-foreground/25",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function CadenceRecBlock({
  title,
  caption,
  items,
  toneByPriority,
}: {
  title: string;
  caption?: string;
  items: RecItem[];
  toneByPriority: Record<string, string>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="font-display text-fluid-xl text-foreground">{title}</h4>
        {caption && <span className="text-fluid-sm text-foreground/55">{caption}</span>}
      </div>
      <EmotionRecommendationSlider
        className="mt-4"
        items={items}
        toneByPriority={toneByPriority}
        showEvidence
      />
    </div>
  );
}

function recommendationIcon(text: string, index: number): LucideIcon {
  if (/수면|잠|밤|휴대폰|카페인/.test(text)) return Moon;
  if (/약|복용|의료|병원|상담/.test(text)) return Pill;
  if (/운동|산책|움직|활동|스트레칭/.test(text)) return Dumbbell;
  if (/물|식사|밥|차|카페인/.test(text)) return Coffee;
  if (/음악|노래/.test(text)) return Music;
  if (/책|읽|명언/.test(text)) return BookOpen;
  if (/가족|친구|대화|인사|이야기/.test(text)) return HeartHandshake;
  if (/무리|낙상|어지러/.test(text)) return ShieldCheck;
  return [Sparkles, Activity, HeartHandshake][index % 3];
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

function EmotionRecommendationSlider({
  items,
  toneByPriority,
  className,
  showEvidence = false,
}: {
  items: RecItem[];
  toneByPriority: Record<string, string>;
  className?: string;
  showEvidence?: boolean;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

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

  useEffect(() => {
    if (!api || paused || items.length < 2) return;
    const id = window.setInterval(() => {
      if (api.canScrollNext()) api.scrollNext();
      else api.scrollTo(0);
    }, 5200);
    return () => window.clearInterval(id);
  }, [api, items.length, paused]);

  if (items.length === 0) return null;

  return (
    <div
      className={className}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Carousel setApi={setApi} opts={{ align: "start", loop: items.length > 1 }}>
        <CarouselContent className="-ml-3">
          {items.map((r, i) => {
            const Icon = recommendationIcon(r.text, i);
            const sourceLabel = recommendationSourceLabel(r);
            return (
              <CarouselItem key={`${r.text}-${i}`} className="pl-3">
                <article className="min-h-[286px] animate-rise-in rounded-2xl border border-border/70 bg-background p-5 shadow-soft">
                  <div className="flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold",
                          toneByPriority[r.priority] ?? toneByPriority.keep,
                        )}
                      >
                        {recommendationKindLabel(r.kind)} · {REC_PRIORITY_LABEL[r.priority]}
                      </span>
                      <p className="mt-3 text-lg font-bold leading-snug text-foreground">
                        {r.text}
                      </p>
                    </div>
                  </div>
                  {sourceLabel && (
                    <p className="mt-4 rounded-xl bg-surface px-3 py-2 text-sm font-semibold leading-relaxed text-foreground/70">
                      {sourceLabel}
                    </p>
                  )}
                  {r.hint && (
                    <p className="mt-4 text-sm font-medium leading-relaxed text-muted-foreground">
                      <span className="font-bold text-foreground/70">왜 추천하나요? </span>
                      {r.hint}
                    </p>
                  )}
                  {showEvidence && r.evidence && (
                    <p className="mt-3 text-xs leading-relaxed text-foreground/45">
                      근거: {r.evidence}
                    </p>
                  )}
                </article>
              </CarouselItem>
            );
          })}
        </CarouselContent>

      </Carousel>

      {items.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${i + 1}번째 권고 보기`}
              onClick={() => api?.scrollTo(i)}
              className="flex h-8 w-8 items-center justify-center"
            >
              <span
                className={cn(
                  "rounded-full transition-all duration-300",
                  active === i ? "h-2.5 w-7 bg-primary" : "h-2.5 w-2.5 bg-foreground/25",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
