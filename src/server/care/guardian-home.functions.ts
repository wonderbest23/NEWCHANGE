/**
 * Guardian Home — 보호자 대시보드용 데이터 묶음.
 *
 * 6단계: "플랫폼이 부모님에게 전화해서 얻은 결과를 보호자가 확인하는 화면" 구조.
 *
 * 한 번의 호출로:
 *  - 현재 보호자의 첫 번째 care_recipient
 *  - 오늘 가장 최근 call_session + 대화 turns
 *  - 오늘 extracted_check_results (meal/medication/symptom/mood/sleep/help/sms_reply)
 *  - 오늘 daily_log
 *  - open anomaly_alerts (severity 포함)
 *  - 최근 notification_outbox (parent SMS fallback 상태)
 *  - 최근 outbound_call_jobs (발신/retry 상태)
 *  - canCallNow (call_window + do_not_disturb 기반)
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isWithinCallWindow } from "@/server/care/call-jobs.shared";

export interface ChatMsg {
  from: "ai" | "mom";
  text: string;
}

// 모든 axis 의 jsonb value 를 그대로 노출 (TanStack 직렬화 호환을 위해 느슨한 객체 타입).
// 화면에서는 axis 별로 좁혀서 사용.
// eslint-disable-next-line @typescript-eslint/ban-types
export type ExtractedAxisValue = {};

export interface ExtractedAxisRow {
  axis:
    | "meal"
    | "medication"
    | "symptom"
    | "mood"
    | "sleep"
    | "help"
    | "sms_reply"
    | string;
  value: ExtractedAxisValue;
  recorded_for_date: string;
  created_at: string;
}

export interface OpenAlertRow {
  id: string;
  rule_code: string;
  severity: string;
  status: string;
  guardian_message: string;
  created_at: string;
}

export interface FallbackStatusRow {
  id: string;
  template_code: string;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  last_error: string | null;
}

export interface CallJobRow {
  id: string;
  status: string;
  reason: string | null;
  scheduled_at: string | null;
  retry_count: number;
  created_at: string;
}

export interface VoicePsychRow {
  id: string;
  analyzed_for_date: string;
  overall_tone: string;
  energy_score: number;
  fatigue_score: number;
  depression_score: number;
  anxiety_score: number;
  anger_score: number;
  voice_features: Record<string, number | string> | null;
  summary: string;
  risk_flags: string[];
  created_at: string;
}

export interface DailyLogRow {
  meal_status: string | null;
  sleep_status: string | null;
  mood_status: string | null;
  activity_note: string | null;
}

export interface GuardianHomeData {
  recipient: {
    id: string;
    display_name: string;
    do_not_disturb: boolean;
    call_window_start: string;
    call_window_end: string;
    timezone: string | null;
  } | null;
  todayState: "ok" | "watch" | "urgent" | "none";
  todayCall: {
    id: string;
    started_at: string | null;
    ended_at: string | null;
    duration_sec: number | null;
    status: string;
    end_reason: string | null;
  } | null;
  transcript: ChatMsg[];
  extracted: ExtractedAxisRow[];
  dailyLog: DailyLogRow | null;
  openAlerts: OpenAlertRow[];
  fallbackStatus: FallbackStatusRow[];
  callJobs: CallJobRow[];
  voicePsych: VoicePsychRow[];
  canCallNow: boolean;
  // 화면 표기용 헬퍼
  stats: {
    medication: { value: string; sub: string; tone: "sage" | "amber" | "rose" };
    activity: { value: string; sub: string; tone: "sage" | "amber" | "rose" };
    sleep: { value: string; sub: string; tone: "sage" | "amber" | "rose" };
    anomaly: { value: string; sub: string; tone: "sage" | "amber" | "rose" };
  };
  aiSummary: string;
  openAlertsCount: number;
}

function emptyForNoRecipient(): GuardianHomeData {
  return {
    recipient: null,
    todayState: "none",
    todayCall: null,
    transcript: [],
    extracted: [],
    dailyLog: null,
    openAlerts: [],
    fallbackStatus: [],
    callJobs: [],
    voicePsych: [],
    canCallNow: false,
    stats: {
      medication: { value: "—", sub: "등록 필요", tone: "amber" },
      activity: { value: "—", sub: "등록 필요", tone: "amber" },
      sleep: { value: "—", sub: "등록 필요", tone: "amber" },
      anomaly: { value: "—", sub: "등록 필요", tone: "amber" },
    },
    aiSummary: "먼저 부모님을 등록해 주세요.",
    openAlertsCount: 0,
  };
}

export const getGuardianHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GuardianHomeData> => {
    const { supabase } = context;

    // 1) 첫 번째 돌봄 대상자
    const { data: recipients, error: rErr } = await supabase
      .from("care_recipients")
      .select(
        "id, display_name, do_not_disturb, call_window_start, call_window_end, timezone",
      )
      .order("created_at", { ascending: true })
      .limit(1);
    if (rErr) throw rErr;

    const recipient = recipients?.[0] ?? null;
    if (!recipient) return emptyForNoRecipient();

    const today = new Date().toISOString().slice(0, 10);

    // 2) 병렬 조회: 최근 통화 / 오늘 알림 / 오늘 daily_log / 오늘 extracted / 최근 fallback / 최근 jobs / 최근 음성 심리 분석
    const [sessionRes, alertsRes, logRes, extractedRes, fallbackRes, jobsRes, psychRes] =
      await Promise.all([
        supabase
          .from("call_sessions")
          .select("id, started_at, ended_at, duration_sec, status, end_reason")
          .eq("care_recipient_id", recipient.id)
          .order("started_at", { ascending: false, nullsFirst: false })
          .limit(1),
        supabase
          .from("anomaly_alerts")
          .select("id, rule_code, severity, status, guardian_message, created_at")
          .eq("care_recipient_id", recipient.id)
          .eq("status", "open")
          .order("created_at", { ascending: false }),
        supabase
          .from("daily_log")
          .select("meal_status, sleep_status, mood_status, activity_note")
          .eq("care_recipient_id", recipient.id)
          .eq("log_date", today)
          .maybeSingle(),
        supabase
          .from("extracted_check_results")
          .select("axis, value, recorded_for_date, created_at")
          .eq("care_recipient_id", recipient.id)
          .eq("recorded_for_date", today)
          .order("created_at", { ascending: false }),
        // notification_outbox 는 RLS 가 false 이므로 보호자 컨텍스트에선 조회 불가.
        // 대신 최근 callJobs 의 reason='retry' 여부로 fallback 진행 상황을 화면에 노출.
        Promise.resolve({ data: [] as FallbackStatusRow[], error: null }),
        supabase
          .from("outbound_call_jobs")
          .select("id, status, reason, scheduled_at, retry_count, created_at")
          .eq("care_recipient_id", recipient.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("voice_psych_analyses")
          .select(
            "id, analyzed_for_date, overall_tone, energy_score, fatigue_score, depression_score, anxiety_score, anger_score, voice_features, summary, risk_flags, created_at",
          )
          .eq("care_recipient_id", recipient.id)
          .order("analyzed_for_date", { ascending: false })
          .limit(7),
      ]);

    if (sessionRes.error) throw sessionRes.error;
    if (alertsRes.error) throw alertsRes.error;
    if (extractedRes.error) throw extractedRes.error;
    if (jobsRes.error) throw jobsRes.error;
    if (psychRes.error) throw psychRes.error;

    const todayCall = sessionRes.data?.[0] ?? null;
    const openAlerts = (alertsRes.data ?? []) as OpenAlertRow[];
    const dailyLog = (logRes.data ?? null) as DailyLogRow | null;
    const extracted = ((extractedRes.data ?? []) as unknown[]).map((row) => {
      const r = row as {
        axis: string;
        value: unknown;
        recorded_for_date: string;
        created_at: string;
      };
      return {
        axis: r.axis,
        value: (r.value ?? {}) as ExtractedAxisValue,
        recorded_for_date: r.recorded_for_date,
        created_at: r.created_at,
      };
    });
    const callJobs = (jobsRes.data ?? []) as CallJobRow[];
    const fallbackStatus: FallbackStatusRow[] = fallbackRes.data ?? [];

    // 3) 대화 turns
    let transcript: ChatMsg[] = [];
    if (todayCall) {
      const { data: turns } = await supabase
        .from("call_turns")
        .select("role, raw_text, turn_index")
        .eq("session_id", todayCall.id)
        .order("turn_index", { ascending: true })
        .limit(12);
      transcript = (turns ?? [])
        .filter((t) => t.raw_text)
        .map((t) => ({
          from: t.role === "user" ? "mom" : "ai",
          text: t.raw_text as string,
        }));
    }

    // 4) 오늘 상태
    const hasCritical = openAlerts.some((a) => a.severity === "critical");
    const todayState: GuardianHomeData["todayState"] = hasCritical
      ? "urgent"
      : openAlerts.length > 0
        ? "watch"
        : "ok";

    const aiSummary = !todayCall
      ? "오늘은 아직 안부 통화 결과가 없어요."
      : hasCritical
        ? "긴급 신호가 감지됐어요. 바로 확인해 주세요."
        : openAlerts.length > 0
          ? `재확인이 필요한 신호 ${openAlerts.length}건이 있어요.`
          : "오늘 안부 통화 결과는 평온해요.";

    // 5) canCallNow
    const canCallNow =
      !recipient.do_not_disturb &&
      isWithinCallWindow(
        recipient.call_window_start,
        recipient.call_window_end,
        recipient.timezone ?? "Asia/Seoul",
      );

    // 6) stats — 새 extracted 데이터 우선, fallback 으로 daily_log
    const medAxis = extracted.find((e) => e.axis === "medication");
    const mealAxis = extracted.find((e) => e.axis === "meal");
    const sleepAxis = extracted.find((e) => e.axis === "sleep");
    const moodAxis = extracted.find((e) => e.axis === "mood");

    const valStatus = (v: ExtractedAxisValue | undefined): string | null => {
      const s = (v as { status?: unknown } | undefined)?.status;
      return typeof s === "string" ? s : null;
    };
    const medStatus = valStatus(medAxis?.value);
    const mealStatus = valStatus(mealAxis?.value) ?? dailyLog?.meal_status ?? null;
    const sleepStatus = valStatus(sleepAxis?.value) ?? dailyLog?.sleep_status ?? null;
    const moodStatus = valStatus(moodAxis?.value) ?? dailyLog?.mood_status ?? null;

    return {
      recipient: {
        id: recipient.id,
        display_name: recipient.display_name,
        do_not_disturb: recipient.do_not_disturb,
        call_window_start: recipient.call_window_start,
        call_window_end: recipient.call_window_end,
        timezone: recipient.timezone,
      },
      todayState,
      todayCall,
      transcript,
      extracted,
      dailyLog,
      openAlerts,
      fallbackStatus,
      callJobs,
      voicePsych: (psychRes.data ?? []) as unknown as VoicePsychRow[],
      canCallNow,
      stats: {
        medication: {
          value: medStatus ? medLabel(medStatus) : "—",
          sub: mealStatus ? `식사 ${mealLabel(mealStatus)}` : "기록 없음",
          tone: medTone(medStatus),
        },
        activity: {
          value: moodStatus ? moodLabel(moodStatus) : "—",
          sub: dailyLog?.activity_note ?? "기분 기록",
          tone: moodTone(moodStatus),
        },
        sleep: {
          value: sleepStatus ? sleepLabel(sleepStatus) : "—",
          sub: sleepStatus ? "수면 상태" : "기록 없음",
          tone: sleepTone(sleepStatus),
        },
        anomaly: {
          value: `${openAlerts.length}건`,
          sub: openAlerts.length === 0 ? "평온한 하루" : "재확인 필요",
          tone: openAlerts.length === 0 ? "sage" : hasCritical ? "rose" : "amber",
        },
      },
      aiSummary,
      openAlertsCount: openAlerts.length,
    };
  });

// ── 표기 헬퍼 ────────────────────────────────────────────────
function medLabel(s: string): string {
  return (
    {
      taken: "복용",
      partial: "일부",
      missed: "누락",
      no_meds: "약 없음",
      unknown: "확인 안됨",
    }[s] ?? s
  );
}
function medTone(s: string | null): "sage" | "amber" | "rose" {
  if (!s) return "amber";
  if (s === "taken" || s === "no_meds") return "sage";
  if (s === "missed") return "rose";
  return "amber";
}
function mealLabel(s: string): string {
  return (
    { eaten: "함", partial: "일부", skipped: "거름", unknown: "확인 안됨" }[s] ?? s
  );
}
function sleepLabel(s: string): string {
  return { well: "잘 잤어요", poor: "설침", unknown: "확인 안됨" }[s] ?? s;
}
function sleepTone(s: string | null): "sage" | "amber" | "rose" {
  if (!s) return "amber";
  if (s === "well") return "sage";
  if (s === "poor") return "rose";
  return "amber";
}
function moodLabel(s: string): string {
  return (
    { good: "좋음", ok: "보통", down: "가라앉음", anxious: "불안", unknown: "확인 안됨" }[
      s
    ] ?? s
  );
}
function moodTone(s: string | null): "sage" | "amber" | "rose" {
  if (!s) return "amber";
  if (s === "good") return "sage";
  if (s === "down" || s === "anxious") return "rose";
  return "amber";
}
