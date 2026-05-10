import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layouts/AppLayout";
import { useAuth } from "@/lib/auth/mock-auth";
import { useAppState } from "@/lib/auth/use-app-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/brand/StatusBadge";
import {
  Activity,
  AlertTriangle,
  AudioLines,
  Bell,
  ChevronRight,
  Footprints,
  Loader2,
  MessageCircleHeart,
  Moon,
  Phone,
  PhoneOff,
  Pill,
  RefreshCcw,
  Sparkles,
  Utensils,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionCached } from "@/lib/auth/session-cache";
import {
  getGuardianHome,
  type ChatMsg,
  type GuardianHomeData,
} from "@/server/care/guardian-home.functions";
import { createImmediateCallJob } from "@/server/care/call-jobs.functions";
import { requireAuthBeforeLoad } from "@/lib/auth/route-guard";
import { toast } from "sonner";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/guardian/dashboard")({
  ssr: false,
  beforeLoad: requireAuthBeforeLoad,
  pendingComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <p className="text-lg text-foreground/70">안전하게 확인 중입니다.</p>
    </div>
  ),
  head: () => ({
    meta: [
      { title: "오늘의 곁 — 보호자 홈" },
      {
        name: "description",
        content:
          "오늘 AI가 부모님께 안부 전화로 확인한 결과를 보호자가 한눈에 봅니다.",
      },
    ],
  }),
  component: GuardianHome,
});

function GuardianHome() {
  const { isAuthenticated, loading: authLoading, userId } = useAuth();
  const navigate = useNavigate();

  // 공유 캐시 사용 — 첫 화면을 막지 않도록 대시보드 데이터와 병렬로만 확인
  const { data: appState } = useAppState({ enabled: isAuthenticated && !!userId });

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate({ to: "/auth", search: { mode: "signin" } });
      return;
    }
    if (!appState) return;
    // 보호자 외에는 모두 본인 메인으로 보낸다 (/home, /admin)
    if (appState.destination !== "/watch") {
      navigate({ to: appState.destination });
    }
  }, [authLoading, isAuthenticated, appState, navigate]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["guardian-home", userId],
    enabled: !authLoading && isAuthenticated && !!userId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    queryFn: async () => {
      const { data: session } = await getSessionCached();
      const token = session.session?.access_token;
      return getGuardianHome({
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      } as Parameters<typeof getGuardianHome>[0]) as Promise<GuardianHomeData>;
    },
  });

  if (authLoading) {
    return (
      <AppLayout context="guardian">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          불러오는 중…
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout context="guardian">
      <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6 sm:py-8">
        <Header data={data} />

        {isLoading && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              안부 데이터를 불러오는 중…
            </div>
            <SkeletonCard />
          </div>
        )}
        {error && (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            <p className="font-medium">데이터를 불러오지 못했어요.</p>
            <p className="mt-1 text-xs text-destructive/80 break-words">
              {(error as Error)?.message ?? "잠시 후 다시 시도해 주세요."}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 gap-2"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              다시 시도
            </Button>
          </div>
        )}

        {data && !data.recipient && <EmptyState />}

        {data && data.recipient && (
          <>
            <CallNowBanner data={data} />
            <CallResultCard data={data} />
            <ExtractedGrid data={data} />
            <VoicePsychCard data={data} />
            <FallbackPanel data={data} />
            <AISummaryCard text={data.aiSummary} count={data.openAlertsCount} />
            <QuickActions />
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Header({ data }: { data?: GuardianHomeData }) {
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const tone =
    data?.todayState === "urgent"
      ? "rose"
      : data?.todayState === "watch"
        ? "amber"
        : "sage";
  const label =
    data?.todayState === "urgent"
      ? "긴급"
      : data?.todayState === "watch"
        ? "주의"
        : data?.todayState === "ok"
          ? "좋음"
          : "—";

  return (
    <header className="flex items-end justify-between gap-3">
      <div>
        <p className="text-[12px] font-medium text-muted-foreground">{today}</p>
        <h1 className="font-display text-[22px] leading-tight tracking-tight sm:text-[26px]">
          {data?.recipient
            ? `${data.recipient.display_name}님 안부 결과`
            : "오늘의 곁"}
        </h1>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          AI가 부모님께 전화해 확인한 내용입니다.
        </p>
      </div>
      {data?.recipient && (
        <StatusBadge tone={tone} dot>
          {label}
        </StatusBadge>
      )}
    </header>
  );
}

function CallNowBanner({ data }: { data: GuardianHomeData }) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!data.recipient || !userId) throw new Error("missing_context");
      const { data: session } = await getSessionCached();
      const token = session.session?.access_token;
      const res = await createImmediateCallJob({
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        data: {
          careRecipientId: data.recipient.id,
          requestedByProfileId: userId,
        },
      } as Parameters<typeof createImmediateCallJob>[0]);
      if (!res.ok) throw new Error(res.error ?? "call_failed");
      return res;
    },
    onSuccess: () => {
      toast.success("안부 전화를 큐에 등록했어요. 곧 발신됩니다.");
      queryClient.invalidateQueries({ queryKey: ["guardian-home"] });
    },
    onError: (e: Error) => {
      const map: Record<string, string> = {
        recipient_not_found: "부모님 정보를 찾을 수 없어요.",
        recipient_inactive: "부모님 계정이 비활성 상태예요.",
        not_in_family: "가족 권한이 없어요.",
      };
      toast.error(map[e.message] ?? `전화 요청 실패: ${e.message}`);
    },
  });

  const dnd = data.recipient?.do_not_disturb;
  const window = `${data.recipient?.call_window_start?.slice(0, 5)}–${data.recipient?.call_window_end?.slice(0, 5)}`;

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-foreground">
            지금 안부 전화 보내기
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            통화 가능 시간 {window}
            {dnd ? " · 방해 금지 켜짐" : data.canCallNow ? " · 지금 가능" : " · 시간대 외"}
          </p>
        </div>
        <Button
          size="sm"
          variant={data.canCallNow ? "hero" : "outline"}
          disabled={!data.canCallNow || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="gap-1.5 rounded-full"
        >
          {mutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : data.canCallNow ? (
            <Phone className="h-3.5 w-3.5" />
          ) : (
            <PhoneOff className="h-3.5 w-3.5" />
          )}
          {data.canCallNow ? "지금 전화" : "통화 불가"}
        </Button>
      </div>
    </div>
  );
}

const FALLBACK_TRANSCRIPT: ChatMsg[] = [
  { from: "ai", text: "어머니, 곁이에요. 오늘 컨디션 어떠세요?" },
  { from: "mom", text: "응, 오늘은 괜찮아. 잘 잤어." },
  { from: "ai", text: "혈압약은 챙겨 드셨어요?" },
  { from: "mom", text: "방금 먹었지." },
];

function CallResultCard({ data }: { data: GuardianHomeData }) {
  const transcript =
    data.transcript.length > 0 ? data.transcript : FALLBACK_TRANSCRIPT;
  const isFallback = data.transcript.length === 0;
  const time = data.todayCall?.started_at
    ? new Date(data.todayCall.started_at).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  const isLive = data.todayCall?.status === "in_progress";
  const endReasonLabel = (() => {
    if (!data.todayCall) return "예시 대화";
    if (isLive) return "통화 중";
    const r = data.todayCall.end_reason;
    return (
      {
        completed_normal: "정상 종료",
        no_answer: "응답 없음",
        busy: "통화 중이어서 못 받음",
        failed: "실패",
        wrong_person: "다른 분 받음",
      }[r ?? ""] ?? "통화 완료"
    );
  })();

  return (
    <section className="overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-rose-soft/60 via-amber-soft/40 to-sage-soft/50 p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            곁
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-sage ring-2 ring-background" />
          </span>
          <div className="leading-tight">
            <p className="text-[12px] font-semibold text-foreground">
              {isFallback ? "AI 안부 통화 (예시)" : "AI 안부 통화"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {isFallback ? "아직 통화 기록이 없어요" : `${time} · ${endReasonLabel}`}
            </p>
          </div>
        </div>
        <span
          className={`flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium backdrop-blur ${
            isLive ? "text-primary" : "text-foreground/70"
          }`}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${
                isLive ? "bg-primary" : "bg-sage"
              }`}
            />
            <span
              className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                isLive ? "bg-primary" : "bg-sage"
              }`}
            />
          </span>
          {isLive ? "LIVE" : "DONE"}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {transcript.slice(-6).map((m, i) => (
          <ChatBubble key={i} msg={m} />
        ))}
      </div>
    </section>
  );
}

function ChatBubble({ msg }: { msg: ChatMsg }) {
  const isAI = msg.from === "ai";
  return (
    <div className={`flex ${isAI ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-soft ${
          isAI
            ? "rounded-bl-md bg-background/90 text-foreground backdrop-blur"
            : "rounded-br-md bg-foreground text-background"
        }`}
      >
        {msg.text}
      </div>
    </div>
  );
}

function ExtractedGrid({ data }: { data: GuardianHomeData }) {
  const tiles = [
    {
      icon: <Utensils className="h-3.5 w-3.5" />,
      label: "식사",
      ...data.stats.medication, // (필드명 충돌 방지를 위해 medication 항목에 식사 라벨 노출)
    },
    {
      icon: <Pill className="h-3.5 w-3.5" />,
      label: "복약",
      value: data.stats.medication.value,
      sub: data.stats.medication.sub,
      tone: data.stats.medication.tone,
    },
    {
      icon: <Moon className="h-3.5 w-3.5" />,
      label: "수면",
      ...data.stats.sleep,
    },
    {
      icon: <MessageCircleHeart className="h-3.5 w-3.5" />,
      label: "기분",
      ...data.stats.activity,
    },
    {
      icon: <Activity className="h-3.5 w-3.5" />,
      label: "이상신호",
      ...data.stats.anomaly,
    },
    {
      icon: <Footprints className="h-3.5 w-3.5" />,
      label: "메모",
      value: data.dailyLog?.activity_note ? "기록됨" : "—",
      sub: data.dailyLog?.activity_note ?? "기록 없음",
      tone: "amber" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {tiles.map((t) => (
        <StatTile key={t.label} {...t} />
      ))}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "rose" | "sage" | "amber";
}) {
  const bg = {
    rose: "bg-rose-soft text-primary",
    sage: "bg-sage-soft text-sage",
    amber: "bg-amber-soft text-amber-warm",
  }[tone];
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft hover:border-primary/30">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-md ${bg}`}
        >
          {icon}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-1.5 font-display text-lg font-semibold leading-none text-foreground">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}


const TONE_LABEL: Record<string, string> = {
  calm_warm: "차분하고 따뜻함",
  low_energy_flat: "기력 저하 · 단조로움",
  bright_energetic: "활기참",
  anxious_tense: "불안 · 긴장",
  irritable: "예민함",
};

const RISK_LABEL: Record<string, string> = {
  mild_pain_sigh: "통증 한숨",
  low_energy: "활력 저하",
  flattened_affect: "정서 둔화",
  voice_tremor: "음성 떨림",
  rapid_speech: "말 빠름",
};

const FEATURE_LABEL: Record<string, { label: string; unit?: string; hint?: string }> = {
  pitch_hz_mean: { label: "평균 음높이", unit: "Hz", hint: "낮을수록 가라앉은 톤" },
  pitch_variability: { label: "음높이 변동", hint: "낮을수록 단조로운 말투(정서 둔화 신호)" },
  speech_rate_wpm: { label: "말 속도", unit: "wpm", hint: "정상 범위 110~150" },
  avg_volume_db: { label: "평균 음량", unit: "dB", hint: "낮을수록 기력 저하 신호" },
  jitter: { label: "지터(떨림)", hint: "0.04 이상이면 음성 떨림" },
  shimmer: { label: "쉼머(거칢)", hint: "0.05 이상이면 음성 거칠어짐" },
  voice_breaks: { label: "끊김 횟수", hint: "통화 중 음성이 끊긴 횟수" },
  laugh_count: { label: "웃음 횟수", hint: "긍정 정서 지표" },
};

const RISK_DETAIL: Record<string, string> = {
  low_energy: "음량과 말 속도가 평소보다 낮아요. 기력이 떨어진 상태일 수 있어요.",
  flattened_affect: "음높이 변동이 거의 없어요. 정서가 둔화된 상태일 수 있어 우울 신호로 봅니다.",
  voice_tremor: "지터(미세 떨림)가 평소보다 높아요. 피로/불안/약물 영향 가능성이 있어요.",
  rapid_speech: "말 속도가 빨라져 있어요. 불안하거나 긴장 상태일 수 있어요.",
  mild_pain_sigh: "한숨 빈도가 늘었어요. 가벼운 통증/불편감이 있을 수 있어요.",
};

function VoicePsychCard({ data }: { data: GuardianHomeData }) {
  const list = data.voicePsych ?? [];
  const [open, setOpen] = useState(false);
  if (list.length === 0) return null;
  const today = list[0];
  const yesterday = list[1];

  const bars = Array.from({ length: 32 }, (_, i) => {
    const seed = (today.energy_score + 30) / 100;
    const wobble =
      Math.sin(i * 0.7) * 0.4 +
      Math.sin(i * 1.9 + today.anxiety_score / 30) * 0.3 +
      0.5;
    const h = Math.max(8, Math.min(100, wobble * seed * 110));
    return h;
  });

  const scores: { key: string; label: string; v: number; tone: "rose" | "amber" | "sage" }[] = [
    { key: "energy", label: "활력", v: today.energy_score, tone: today.energy_score >= 55 ? "sage" : today.energy_score >= 35 ? "amber" : "rose" },
    { key: "depression", label: "우울감", v: today.depression_score, tone: today.depression_score < 35 ? "sage" : today.depression_score < 60 ? "amber" : "rose" },
    { key: "anxiety", label: "불안", v: today.anxiety_score, tone: today.anxiety_score < 35 ? "sage" : today.anxiety_score < 60 ? "amber" : "rose" },
    { key: "fatigue", label: "피로", v: today.fatigue_score, tone: today.fatigue_score < 40 ? "sage" : today.fatigue_score < 65 ? "amber" : "rose" },
  ];

  const dateLabel = new Date(today.analyzed_for_date).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <>
      <section
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="cursor-pointer overflow-hidden rounded-3xl border border-border/60 bg-card p-4 shadow-soft transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <AudioLines className="h-3.5 w-3.5" />
            </span>
            <div className="leading-tight">
              <p className="text-[12px] font-semibold text-foreground">음성 파형 심리분석</p>
              <p className="text-[11px] text-muted-foreground">
                탭하여 자세히 보기 · {dateLabel}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {TONE_LABEL[today.overall_tone] ?? today.overall_tone}
          </span>
        </header>

        <div className="mb-4 flex h-20 items-center justify-between gap-[2px] rounded-2xl bg-gradient-to-r from-rose-soft/40 via-amber-soft/30 to-sage-soft/40 px-3">
          {bars.map((h, i) => (
            <span key={i} className="w-1 rounded-full bg-primary/70" style={{ height: `${h}%` }} />
          ))}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {scores.map((s) => {
            const bar = { rose: "bg-primary", amber: "bg-amber-warm", sage: "bg-sage" }[s.tone];
            return (
              <div key={s.key} className="rounded-xl border border-border/50 bg-background/60 p-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </span>
                  <span className="font-display text-sm font-semibold">{s.v}</span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full ${bar}`} style={{ width: `${s.v}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[12.5px] leading-relaxed text-foreground/90">{today.summary}</p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {today.risk_flags?.map((f) => (
            <span
              key={f}
              className="rounded-full bg-rose-soft/80 px-2 py-0.5 text-[10px] font-medium text-primary"
            >
              ⚠ {RISK_LABEL[f] ?? f}
            </span>
          ))}
          {yesterday && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              어제 우울감 {yesterday.depression_score} → 오늘 {today.depression_score}
            </span>
          )}
        </div>
      </section>

      <VoicePsychDetailDialog
        open={open}
        onOpenChange={setOpen}
        today={today}
        yesterday={yesterday}
        scores={scores}
        history={list}
      />
    </>
  );
}

function VoicePsychDetailDialog({
  open,
  onOpenChange,
  today,
  yesterday,
  scores,
  history,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  today: GuardianHomeData["voicePsych"][number];
  yesterday?: GuardianHomeData["voicePsych"][number];
  scores: { key: string; label: string; v: number; tone: "rose" | "amber" | "sage" }[];
  history: GuardianHomeData["voicePsych"];
}) {
  const features = (today.voice_features ?? {}) as Record<string, number | string>;
  const dateLabel = new Date(today.analyzed_for_date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const analyzedAt = new Date(today.created_at).toLocaleString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // 짧은 해석
  const interpretation = (() => {
    const parts: string[] = [];
    if (today.depression_score >= 60) parts.push("우울 신호가 평소보다 두드러져요.");
    else if (today.depression_score < 35) parts.push("정서적으로 안정된 톤이에요.");
    if (today.energy_score < 40) parts.push("활력이 낮게 측정됐어요.");
    if (today.anxiety_score >= 60) parts.push("불안 지표가 높게 나왔어요.");
    if (today.fatigue_score >= 65) parts.push("피로감이 음성에서 감지돼요.");
    if (yesterday) {
      const diff = today.depression_score - yesterday.depression_score;
      if (Math.abs(diff) >= 10) {
        parts.push(
          diff > 0
            ? `어제보다 우울감이 ${diff}p 올라갔어요.`
            : `어제보다 우울감이 ${Math.abs(diff)}p 내려갔어요.`,
        );
      }
    }
    if (parts.length === 0) parts.push("전반적으로 평소 범위 안의 음성 패턴이에요.");
    return parts.join(" ");
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AudioLines className="h-4 w-4 text-primary" />
            음성 심리분석 상세
          </DialogTitle>
          <DialogDescription>
            {dateLabel} · 분석 시각 {analyzedAt}
          </DialogDescription>
        </DialogHeader>

        {/* 종합 톤 */}
        <div className="rounded-2xl bg-secondary/60 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            종합 톤
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {TONE_LABEL[today.overall_tone] ?? today.overall_tone}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/90">{today.summary}</p>
        </div>

        {/* 점수 비교 */}
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            심리 지표 (어제 비교)
          </p>
          <div className="space-y-2">
            {scores.map((s) => {
              const yKey = s.key as "energy" | "depression" | "anxiety" | "fatigue";
              const ySc = yesterday ? (yesterday[`${yKey}_score` as const] as number) : undefined;
              const diff = ySc !== undefined ? s.v - ySc : undefined;
              const bar = { rose: "bg-primary", amber: "bg-amber-warm", sage: "bg-sage" }[s.tone];
              return (
                <div key={s.key} className="rounded-xl border border-border/50 p-2.5">
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="font-medium text-foreground">{s.label}</span>
                    <span className="flex items-baseline gap-2">
                      <span className="font-display text-sm font-semibold">{s.v}</span>
                      {diff !== undefined && diff !== 0 && (
                        <span
                          className={`text-[10px] ${diff > 0 ? "text-primary" : "text-sage"}`}
                        >
                          {diff > 0 ? `▲ ${diff}` : `▼ ${Math.abs(diff)}`}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${bar}`} style={{ width: `${s.v}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="rounded-xl border border-border/50 p-2.5">
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="font-medium text-foreground">분노/긴장</span>
                <span className="font-display text-sm font-semibold">{today.anger_score}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 음성 특징 분해 */}
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            음성 특징 (voice features)
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {Object.entries(features).map(([k, v]) => {
              const meta = FEATURE_LABEL[k] ?? { label: k };
              return (
                <div key={k} className="rounded-lg bg-muted/40 p-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-medium text-foreground">{meta.label}</span>
                    <span className="font-mono text-[11px] text-foreground">
                      {String(v)}
                      {meta.unit ? ` ${meta.unit}` : ""}
                    </span>
                  </div>
                  {meta.hint && (
                    <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                      {meta.hint}
                    </p>
                  )}
                </div>
              );
            })}
            {Object.keys(features).length === 0 && (
              <p className="text-[12px] text-muted-foreground">기록된 음성 특징이 없어요.</p>
            )}
          </div>
        </div>

        {/* 7일 위험 추이 타임라인 */}
        <RiskTimelineChart history={history} />

        {/* 위험 신호 설명 */}
        {today.risk_flags && today.risk_flags.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              위험 신호 해설
            </p>
            <ul className="space-y-1.5">
              {today.risk_flags.map((f) => (
                <li
                  key={f}
                  className="rounded-xl border border-rose-soft bg-rose-soft/40 p-2.5 text-[12px] leading-relaxed"
                >
                  <p className="font-semibold text-primary">⚠ {RISK_LABEL[f] ?? f}</p>
                  <p className="mt-0.5 text-foreground/90">
                    {RISK_DETAIL[f] ?? "추가 관찰이 필요한 신호예요."}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 짧은 해석 */}
        <div className="rounded-2xl border border-border/60 bg-background p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            짧은 해석
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/90">{interpretation}</p>
          <p className="mt-2 text-[10.5px] text-muted-foreground">
            ※ 의료 진단이 아닌 음성 패턴 기반 참고 지표예요.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RiskTimelineChart({ history }: { history: GuardianHomeData["voicePsych"] }) {
  // history는 분석일 desc 정렬. 최근 7건만, 시간순(오름차순)으로 변환.
  const data = useMemo(() => {
    const last7 = [...(history ?? [])].slice(0, 7).reverse();
    return last7.map((h) => ({
      date: new Date(h.analyzed_for_date).toLocaleDateString("ko-KR", {
        month: "numeric",
        day: "numeric",
      }),
      우울: h.depression_score,
      불안: h.anxiety_score,
      피로: h.fatigue_score,
      활력: h.energy_score,
    }));
  }, [history]);

  // 위험 플래그 빈도 집계 (최근 7일)
  const flagFreq = useMemo(() => {
    const map = new Map<string, number>();
    (history ?? []).slice(0, 7).forEach((h) =>
      (h.risk_flags ?? []).forEach((f) => map.set(f, (map.get(f) ?? 0) + 1)),
    );
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [history]);

  if (data.length < 2) {
    return (
      <div className="rounded-2xl border border-border/60 bg-muted/30 p-3 text-center">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          7일 위험 추이
        </p>
        <p className="mt-2 text-[12px] text-muted-foreground">
          비교할 분석 기록이 부족해요. 데이터가 쌓이면 추세선이 표시돼요.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          7일 위험 추이
        </p>
        <p className="text-[10px] text-muted-foreground">{data.length}회 분석</p>
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--background))",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
              iconType="circle"
              iconSize={6}
            />
            <Line
              type="monotone"
              dataKey="우울"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 2.5 }}
            />
            <Line
              type="monotone"
              dataKey="불안"
              stroke="#d97706"
              strokeWidth={2}
              dot={{ r: 2.5 }}
            />
            <Line
              type="monotone"
              dataKey="피로"
              stroke="#7c3aed"
              strokeWidth={2}
              dot={{ r: 2.5 }}
            />
            <Line
              type="monotone"
              dataKey="활력"
              stroke="#16a34a"
              strokeWidth={2}
              dot={{ r: 2.5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <TrendSummary data={data} />

      {flagFreq.length > 0 && (
        <div className="mt-2 border-t border-border/50 pt-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            위험 플래그 빈도 (7일)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {flagFreq.map(([flag, count]) => (
              <span
                key={flag}
                className="rounded-full bg-rose-soft/70 px-2 py-0.5 text-[10px] font-medium text-primary"
              >
                {RISK_LABEL[flag] ?? flag} · {count}일
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type TrendPoint = {
  date: string;
  우울: number;
  불안: number;
  피로: number;
  활력: number;
};

function TrendSummary({ data }: { data: TrendPoint[] }) {
  const summary = useMemo(() => {
    if (data.length < 2) return null;
    const metrics: Array<{
      key: "우울" | "불안" | "피로" | "활력";
      // 활력은 높을수록 좋음, 나머지는 높을수록 나쁨
      higherIsBad: boolean;
    }> = [
      { key: "우울", higherIsBad: true },
      { key: "불안", higherIsBad: true },
      { key: "피로", higherIsBad: true },
      { key: "활력", higherIsBad: false },
    ];

    return metrics.map((m) => {
      const values = data.map((d) => d[m.key]);
      const first = values[0];
      const last = values[values.length - 1];
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      const delta = last - first;
      const absDelta = Math.abs(delta);

      // 추세: 단순 선형 기울기 (최소제곱)
      const n = values.length;
      const xs = values.map((_, i) => i);
      const meanX = (n - 1) / 2;
      const meanY = avg;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i] - meanX) * (values[i] - meanY);
        den += (xs[i] - meanX) ** 2;
      }
      const slope = den === 0 ? 0 : num / den;

      // 방향 분류
      let direction: "rising" | "falling" | "flat";
      if (absDelta < 4 && Math.abs(slope) < 1) direction = "flat";
      else if (delta > 0) direction = "rising";
      else direction = "falling";

      // 톤(좋음/나쁨/중립)
      let tone: "good" | "bad" | "neutral";
      if (direction === "flat") tone = "neutral";
      else if (m.higherIsBad) tone = direction === "rising" ? "bad" : "good";
      else tone = direction === "rising" ? "good" : "bad";

      // 해석 문장
      const arrow = direction === "rising" ? "▲" : direction === "falling" ? "▼" : "→";
      const dirText =
        direction === "rising"
          ? `+${absDelta.toFixed(0)}점 상승`
          : direction === "falling"
            ? `-${absDelta.toFixed(0)}점 하락`
            : "큰 변화 없음";

      let interpretation = "";
      if (m.key === "활력") {
        interpretation =
          tone === "good"
            ? "활력이 회복되는 흐름이에요. 긍정적 신호입니다."
            : tone === "bad"
              ? "활력이 점점 떨어지고 있어요. 컨디션 점검이 필요해요."
              : `평균 ${avg.toFixed(0)}점으로 안정적이에요.`;
      } else if (m.key === "우울") {
        interpretation =
          tone === "bad"
            ? "우울 지표가 상승 추세예요. 따뜻한 안부 통화를 권장해요."
            : tone === "good"
              ? "우울 지표가 완화되고 있어요. 좋은 흐름이에요."
              : `평균 ${avg.toFixed(0)}점으로 큰 변화는 없어요.`;
      } else if (m.key === "불안") {
        interpretation =
          tone === "bad"
            ? "불안 신호가 늘고 있어요. 최근 변화나 스트레스 요인을 확인해 주세요."
            : tone === "good"
              ? "불안 수준이 낮아지는 추세예요."
              : `평균 ${avg.toFixed(0)}점, 변동 ${(max - min).toFixed(0)}점.`;
      } else {
        interpretation =
          tone === "bad"
            ? "피로감이 누적되는 흐름이에요. 충분한 휴식을 권해 주세요."
            : tone === "good"
              ? "피로도가 줄어들고 있어요."
              : `평균 ${avg.toFixed(0)}점으로 일정해요.`;
      }

      return { ...m, direction, tone, delta, avg, max, min, arrow, dirText, interpretation };
    });
  }, [data]);

  if (!summary) return null;

  // 전체 종합 한 줄
  const overall = useMemo(() => {
    const bad = summary.filter((s) => s.tone === "bad");
    const good = summary.filter((s) => s.tone === "good");
    if (bad.length >= 2)
      return `최근 ${bad.map((b) => b.key).join("·")} 지표가 함께 악화되고 있어요. 보호자 개입을 권장해요.`;
    if (bad.length === 1)
      return `${bad[0].key} 지표만 악화 중이에요. 해당 영역을 우선 살펴봐 주세요.`;
    if (good.length >= 2) return "전반적으로 회복 흐름이에요. 현재 케어 방식을 유지하세요.";
    if (good.length === 1) return `${good[0].key} 지표가 개선되고 있어요.`;
    return "지난 7일 동안 큰 변동 없이 안정적이에요.";
  }, [summary]);

  const toneClass = (tone: "good" | "bad" | "neutral") =>
    tone === "bad"
      ? "border-rose-soft bg-rose-soft/40 text-primary"
      : tone === "good"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-border/60 bg-muted/40 text-muted-foreground";

  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        7일 추세 자동 요약
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {summary.map((s) => (
          <div
            key={s.key}
            className={`rounded-xl border p-2 text-[11px] leading-snug ${toneClass(s.tone)}`}
          >
            <div className="flex items-center justify-between font-semibold">
              <span>{s.key}</span>
              <span className="text-[10.5px] tabular-nums">
                {s.arrow} {s.dirText}
              </span>
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed opacity-90">{s.interpretation}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-xl border border-border/60 bg-background p-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          종합 해석
        </p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-foreground/90">{overall}</p>
      </div>
    </div>
  );
}

function FallbackPanel({ data }: { data: GuardianHomeData }) {
  // callJobs 의 reason='retry' 또는 status='failed' 가 있으면 fallback 진행 표시
  const retry = data.callJobs.find((j) => j.reason === "retry");
  const failed = data.callJobs.find((j) => j.status === "failed");
  const hasSmsReply = data.extracted.some((e) => e.axis === "sms_reply");

  if (!retry && !failed && !hasSmsReply) return null;

  return (
    <div className="rounded-2xl border border-amber-soft bg-amber-soft/40 p-3.5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-warm" />
        <div className="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground">
          <p className="font-semibold">통화 보조 진행 상황</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {retry && (
              <li>
                · 재시도 발신 예약됨 ({" "}
                {retry.scheduled_at
                  ? new Date(retry.scheduled_at).toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
                )
              </li>
            )}
            {failed && !retry && (
              <li>· 통화 실패 — 부모님께 SMS 안부 확인을 보냈어요.</li>
            )}
            {hasSmsReply && <li>· 부모님이 SMS로 응답을 보내주셨어요.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

const ROTATING: { tag: string; text: string }[] = [
  { tag: "AI 요약", text: "오늘도 평소처럼 활동하셨어요" },
  { tag: "복약 알림", text: "혈압약 챙겨 드셨어요" },
  { tag: "감정 신호", text: "통화 톤이 평소보다 밝아요" },
];

function AISummaryCard({ text, count }: { text: string; count: number }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % ROTATING.length), 3500);
    return () => clearInterval(id);
  }, []);
  const tag = useMemo(
    () => (count > 0 ? "재확인 필요" : ROTATING[idx].tag),
    [count, idx],
  );

  return (
    <Link
      to="/guardian/alerts"
      className="block rounded-3xl border border-border/60 bg-foreground p-4 text-background shadow-soft transition-transform hover:scale-[1.01]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70">
          <Sparkles className="h-3 w-3" />
          {tag}
        </div>
        {count > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold">
            {count}
          </span>
        )}
      </div>
      <p key={idx} className="mt-2 text-sm leading-snug">
        {text}
      </p>
    </Link>
  );
}

function QuickActions() {
  const items = [
    { to: "/guardian/check-in", label: "안부", icon: MessageCircleHeart },
    { to: "/guardian/medications", label: "약", icon: Pill },
    { to: "/guardian/alerts", label: "알림", icon: Bell },
    { to: "/care", label: "통화", icon: Phone },
  ] as const;

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-border/60 bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-soft"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-soft">
            <Icon className="h-4 w-4 text-primary" />
          </span>
          <span className="text-[12px] font-medium text-foreground">
            {label}
          </span>
        </Link>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center">
      <p className="font-display text-lg text-foreground">
        먼저 부모님을 등록해 주세요
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        등록 후 매일 AI 안부 통화 결과를 한 화면에서 확인하실 수 있어요.
      </p>
      <Button asChild className="mt-5">
        <Link to="/care">
          시작하기 <ChevronRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="space-y-3">
      <div className="h-40 animate-pulse rounded-3xl bg-card" />
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />
        ))}
      </div>
    </div>
  );
}
