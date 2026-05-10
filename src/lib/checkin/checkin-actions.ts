import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * 가능한 분류 태그(고정 enum) — UI/추천 알고리즘이 동일 키를 공유.
 */
export const CHECKIN_TAGS = [
  "식사_부족", "식사_정상",
  "수면_불편", "수면_정상",
  "약_복용완료", "약_확인필요",
  "통증_있음", "통증_없음",
  "어지러움_있음",
  "기분_저하", "외로움_언급",
  "활동량_부족",
  "스마트폰_도움필요",
  "병원_상담권장", "보호자_확인권장", "긴급_주의",
] as const;
export type CheckinTag = (typeof CHECKIN_TAGS)[number];

const TranscriptTurn = z.object({
  role: z.enum(["user", "ai"]),
  text: z.string().min(1).max(2000),
});

const AnalyzeInput = z.object({
  transcript: z.array(TranscriptTurn).min(1).max(50),
  durationSec: z.number().int().min(0).max(3600).optional(),
  shareWithGuardian: z.boolean().optional(),
});

interface AnalyzedCheckin {
  summary: string;
  condition_level: "good" | "normal" | "caution" | "urgent";
  meal_status: string | null;
  sleep_status: string | null;
  medicine_status: string | null;
  pain_status: string | null;
  mood_status: string | null;
  loneliness_detected: boolean;
  dizziness_detected: boolean;
  urgent_detected: boolean;
  tags: { tag: CheckinTag; confidence: number }[];
  senior_report: string;
  caregiver_report: string;
  recommendation_tags: CheckinTag[];
}

const SYSTEM_PROMPT = `당신은 한국 노인 안부 통화의 분석가입니다.
- 의료 진단을 절대 하지 않습니다. "위험합니다", "질병입니다" 같은 단정 표현 금지.
- 어르신께 드리는 안내는 짧고 부드럽게, 존댓말로 작성합니다.
- 보호자 리포트는 사실 위주로 짧게 정리합니다.
- 긴급 신호(가슴 통증, 호흡 곤란, 의식 저하, 한쪽 마비, 갑작스러운 쓰러짐, 극심한 두통)가 있으면 condition_level을 "urgent"로 표시합니다.
- 모든 출력은 한국어로 작성합니다.`;

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "save_checkin_analysis",
    description: "한 번의 음성 안부 통화를 구조화 분석합니다.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "한 줄 요약(40자 이내)" },
        condition_level: { type: "string", enum: ["good", "normal", "caution", "urgent"] },
        meal_status: { type: "string", description: "식사 상태 한 단어 (정상/부족/모름)" },
        sleep_status: { type: "string", description: "수면 상태 (정상/불편/모름)" },
        medicine_status: { type: "string", description: "약 복용 (완료/확인필요/모름)" },
        pain_status: { type: "string", description: "통증 (없음/있음/모름)" },
        mood_status: { type: "string", description: "기분 (좋음/보통/저하/모름)" },
        loneliness_detected: { type: "boolean" },
        dizziness_detected: { type: "boolean" },
        urgent_detected: { type: "boolean" },
        tags: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tag: { type: "string", enum: CHECKIN_TAGS as unknown as string[] },
              confidence: { type: "number" },
            },
            required: ["tag", "confidence"],
            additionalProperties: false,
          },
        },
        senior_report: {
          type: "string",
          description: "어르신께 보여드릴 짧은 안내(2-3문장, 부드럽게).",
        },
        caregiver_report: {
          type: "string",
          description: "보호자용 사실 요약(3-5줄).",
        },
        recommendation_tags: {
          type: "array",
          items: { type: "string", enum: CHECKIN_TAGS as unknown as string[] },
          description: "추천 콘텐츠/동네정보 매칭에 쓸 태그(최대 5개).",
        },
      },
      required: [
        "summary", "condition_level",
        "meal_status", "sleep_status", "medicine_status", "pain_status", "mood_status",
        "loneliness_detected", "dizziness_detected", "urgent_detected",
        "tags", "senior_report", "caregiver_report", "recommendation_tags",
      ],
      additionalProperties: false,
    },
  },
} as const;

async function callLovableAI(transcript: { role: string; text: string }[]): Promise<AnalyzedCheckin> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const formatted = transcript
    .map((t) => `${t.role === "ai" ? "AI" : "어르신"}: ${t.text}`)
    .join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `아래 안부 통화 대화를 분석해 save_checkin_analysis 도구로 저장하세요.\n\n${formatted}`,
        },
      ],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "function", function: { name: "save_checkin_analysis" } },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 200)}`);
  }

  const json = await res.json();
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("AI 응답에 도구 호출이 없습니다");
  return JSON.parse(call.function.arguments) as AnalyzedCheckin;
}

export const analyzeAndSaveCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AnalyzeInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // KST 기준 1일 1회 제한
    const startISO = kstStartOfTodayISO();
    const { data: existing } = await supabase
      .from("health_checkins")
      .select("id")
      .eq("senior_user_id", userId)
      .gte("checkin_at", startISO)
      .limit(1)
      .maybeSingle();
    if (existing) {
      throw new Error("DAILY_LIMIT_REACHED");
    }

    const { data: membership } = await supabase
      .from("family_members")
      .select("family_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const familyId = membership?.family_id ?? null;

    const rawTranscript = data.transcript
      .map((t) => `${t.role === "ai" ? "AI" : "어르신"}: ${t.text}`)
      .join("\n");

    let analysis: AnalyzedCheckin;
    try {
      analysis = await callLovableAI(data.transcript);
    } catch (e) {
      console.error("[analyzeAndSaveCheckin] AI 실패, 기본값 저장:", e);
      analysis = {
        summary: "오늘의 안부를 기록했어요.",
        condition_level: "normal",
        meal_status: "모름",
        sleep_status: "모름",
        medicine_status: "모름",
        pain_status: "모름",
        mood_status: "모름",
        loneliness_detected: false,
        dizziness_detected: false,
        urgent_detected: false,
        tags: [],
        senior_report: "오늘도 안부를 나눠주셔서 감사해요. 무리하지 마시고 편안한 하루 보내세요.",
        caregiver_report: "분석 일시 오류로 상세 분류는 비어 있습니다. 통화는 정상 종료되었습니다.",
        recommendation_tags: [],
      };
    }

    const { data: checkin, error: checkinErr } = await supabase
      .from("health_checkins")
      .insert({
        senior_user_id: userId,
        family_id: familyId,
        raw_transcript: rawTranscript,
        summary: analysis.summary,
        condition_level: analysis.condition_level,
        meal_status: analysis.meal_status,
        sleep_status: analysis.sleep_status,
        medicine_status: analysis.medicine_status,
        pain_status: analysis.pain_status,
        mood_status: analysis.mood_status,
        loneliness_detected: analysis.loneliness_detected,
        dizziness_detected: analysis.dizziness_detected,
        urgent_detected: analysis.urgent_detected,
        caregiver_shared: data.shareWithGuardian ?? false,
        duration_sec: data.durationSec ?? null,
      })
      .select("id, checkin_at, condition_level, summary, mood_status")
      .single();
    if (checkinErr || !checkin) throw new Error(`체크 저장 실패: ${checkinErr?.message}`);

    if (analysis.tags.length > 0) {
      await supabase.from("health_checkin_tags").insert(
        analysis.tags.map((t) => ({
          checkin_id: checkin.id,
          tag_name: t.tag,
          confidence: t.confidence,
        })),
      );
    }

    const { data: report, error: reportErr } = await supabase
      .from("health_reports")
      .insert({
        checkin_id: checkin.id,
        senior_report_text: analysis.senior_report,
        caregiver_report_text: analysis.caregiver_report,
        recommendation_tags: analysis.recommendation_tags,
      })
      .select("id, senior_report_text, caregiver_report_text, recommendation_tags")
      .single();
    if (reportErr || !report) throw new Error(`리포트 저장 실패: ${reportErr?.message}`);

    // 추천 동네 자원 (태그 기반)
    let recommendations: Array<{
      id: string;
      name: string;
      resource_type: string;
      region_sigungu: string;
      phone: string | null;
      description: string | null;
    }> = [];
    if (analysis.recommendation_tags.length > 0) {
      const { data: recs } = await supabase
        .from("local_resources")
        .select("id, name, resource_type, region_sigungu, phone, description")
        .overlaps("recommendation_tags", analysis.recommendation_tags)
        .eq("is_active", true)
        .limit(4);
      recommendations = recs ?? [];
    }

    return {
      checkin,
      report,
      recommendations,
    };
  });

export const getRecentCheckins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("health_checkins")
      .select("id, checkin_at, condition_level, summary")
      .eq("senior_user_id", userId)
      .order("checkin_at", { ascending: false })
      .limit(7);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

function kstStartOfTodayISO(): string {
  const kstDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  return new Date(`${kstDate}T00:00:00+09:00`).toISOString();
}

export const getTodayCheckin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const startISO = kstStartOfTodayISO();

    const { data: checkin } = await supabase
      .from("health_checkins")
      .select("id, checkin_at, condition_level, summary, meal_status, sleep_status, medicine_status, mood_status, pain_status")
      .eq("senior_user_id", userId)
      .gte("checkin_at", startISO)
      .order("checkin_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!checkin) return null;

    const { data: report } = await supabase
      .from("health_reports")
      .select("senior_report_text, recommendation_tags")
      .eq("checkin_id", checkin.id)
      .maybeSingle();

    let recommendations: Array<{
      id: string; name: string; resource_type: string; region_sigungu: string;
      phone: string | null; description: string | null;
    }> = [];
    if (report?.recommendation_tags?.length) {
      const { data: recs } = await supabase
        .from("local_resources")
        .select("id, name, resource_type, region_sigungu, phone, description")
        .overlaps("recommendation_tags", report.recommendation_tags)
        .eq("is_active", true)
        .limit(4);
      recommendations = recs ?? [];
    }

    return { checkin, report, recommendations };
  });

/**
 * 보호자가 가족(family_id) 안에서 공유받은 시니어 안부 리포트(최근 N건).
 */
export const getFamilySharedReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: memberships } = await supabase
      .from("family_members")
      .select("family_id")
      .eq("user_id", userId);
    const familyIds = (memberships ?? []).map((m) => m.family_id);
    if (familyIds.length === 0) return [];

    const { data: checkins, error } = await supabase
      .from("health_checkins")
      .select(
        "id, senior_user_id, checkin_at, condition_level, summary, meal_status, sleep_status, medicine_status, pain_status, mood_status, urgent_detected, loneliness_detected"
      )
      .in("family_id", familyIds)
      .eq("caregiver_shared", true)
      .order("checkin_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    if (!checkins || checkins.length === 0) return [];

    const checkinIds = checkins.map((c) => c.id);
    const { data: reports } = await supabase
      .from("health_reports")
      .select("checkin_id, caregiver_report_text, recommendation_tags")
      .in("checkin_id", checkinIds);
    const reportMap = new Map((reports ?? []).map((r) => [r.checkin_id, r]));

    return checkins.map((c) => ({
      ...c,
      report: reportMap.get(c.id) ?? null,
    }));
  });

/**
 * 주/월 단위 리포트: 일별 condition_level과 핵심 지표 시계열을 반환.
 * range: "week" = 최근 7일, "month" = 최근 30일.
 */
export const getCheckinSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ range: z.enum(["week", "month"]).default("week") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const days = data.range === "month" ? 30 : 7;
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const { data: rows, error } = await supabase
      .from("health_checkins")
      .select("id, checkin_at, condition_level, summary, meal_status, sleep_status, medicine_status, pain_status, mood_status, urgent_detected, loneliness_detected, dizziness_detected")
      .eq("senior_user_id", userId)
      .gte("checkin_at", since.toISOString())
      .order("checkin_at", { ascending: true });
    if (error) throw new Error(error.message);

    const items = rows ?? [];
    const counts = {
      total: items.length,
      good: items.filter((r) => r.condition_level === "good").length,
      normal: items.filter((r) => r.condition_level === "normal").length,
      caution: items.filter((r) => r.condition_level === "caution").length,
      urgent: items.filter((r) => r.condition_level === "urgent").length,
      urgent_flags: items.filter((r) => r.urgent_detected).length,
      loneliness_flags: items.filter((r) => r.loneliness_detected).length,
    };

    // KST 기준 일자별 그룹
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
    const byDay = new Map<string, typeof items>();
    for (const r of items) {
      const day = fmt.format(new Date(r.checkin_at));
      const arr = byDay.get(day) ?? [];
      arr.push(r);
      byDay.set(day, arr);
    }
    const daily = Array.from(byDay.entries()).map(([day, arr]) => ({
      day,
      condition_level: arr[arr.length - 1].condition_level,
      summary: arr[arr.length - 1].summary,
    }));

    return { range: data.range, days, counts, daily, items };
  });
