import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  detectEvidenceBasedRisks,
  formatRiskEvidenceForReport,
  hasUrgentEvidenceRisk,
} from "@/lib/checkin/evidence-risk";
import {
  buildCheckinStepAnswers,
  formatStepAnswersForTranscript,
  type CheckinStepAnswer,
} from "@/lib/checkin/checkin-steps";

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
  stepAnswers: z.array(z.custom<CheckinStepAnswer>()).optional(),
  durationSec: z.number().int().min(0).max(3600).optional(),
  shareWithGuardian: z.boolean().optional(),
});

const ReviewStepAnswer = z.object({
  stepId: z.string().min(1).max(40),
  stepLabel: z.string().min(1).max(40),
  question: z.string().min(1).max(1000),
  answer: z.string().min(1).max(2000),
  answeredAt: z.number().optional(),
});

const AmendReviewInput = z.object({
  stepAnswers: z.array(ReviewStepAnswer).min(1).max(12),
});

const DenyMemoryInput = z.object({
  memoryId: z.string().uuid(),
});

const QualityEventInput = z.object({
  checkinId: z.string().uuid().nullable().optional(),
  status: z.enum(["completed", "failed", "too_short", "draft_saved", "review_corrected"]),
  durationSec: z.number().int().min(0).max(3600).default(0),
  expectedStepCount: z.number().int().min(0).max(12).default(6),
  completedStepCount: z.number().int().min(0).max(12).default(0),
  missingStepIds: z.array(z.string().max(40)).max(12).default([]),
  transcriptTurnCount: z.number().int().min(0).max(200).default(0),
  userTurnCount: z.number().int().min(0).max(100).default(0),
  assistantTurnCount: z.number().int().min(0).max(100).default(0),
  correctionCount: z.number().int().min(0).max(100).default(0),
  urgentDetected: z.boolean().default(false),
  resumedFromDraft: z.boolean().default(false),
  draftReason: z.string().max(40).nullable().optional(),
  issueFlags: z.array(z.string().max(80)).max(20).default([]),
  audioStats: z.record(z.string(), z.unknown()).default({}),
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
- 사용자가 "쇼크"를 직접 언급하거나, 식은땀/창백함/빠른 호흡/실신/혼란처럼 쇼크 관련 증상을 여러 개 말하면 긴급 신호로 표시합니다.
- 긴급 판단은 원문 표현과 판단 근거를 보호자 리포트에 반드시 남깁니다.
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

    const stepAnswers = data.stepAnswers?.length
      ? data.stepAnswers
      : buildCheckinStepAnswers(data.transcript);

    const rawTranscriptText = data.transcript
      .map((t) => `${t.role === "ai" ? "AI" : "어르신"}: ${t.text}`)
      .join("\n");
    const structuredStepText = formatStepAnswersForTranscript(stepAnswers);
    const rawTranscript = [rawTranscriptText, structuredStepText].filter(Boolean).join("\n\n");

    const evidenceRisks = dedupeEvidenceRisks([
      ...detectEvidenceBasedRisks(data.transcript),
      ...stepAnswers.flatMap((answer) => answer.riskMatches ?? []),
    ]);
    const urgentEvidence = hasUrgentEvidenceRisk(evidenceRisks);

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

    if (evidenceRisks.length > 0) {
      const evidenceReport = formatRiskEvidenceForReport(evidenceRisks);
      if (urgentEvidence) {
        analysis = {
          ...analysis,
          summary: "긴급 확인이 필요한 표현이 기록됐어요.",
          condition_level: "urgent",
          urgent_detected: true,
          tags: mergeAnalysisTags(analysis.tags, [{ tag: "긴급_주의", confidence: 1 }]),
          recommendation_tags: Array.from(new Set([...analysis.recommendation_tags, "긴급_주의" as CheckinTag])),
          senior_report:
            "오늘 통화에서 바로 확인이 필요한 표현이 있었어요. 혼자 판단하지 마시고 보호자나 119에 바로 연락해 주세요.",
          caregiver_report: [
            "긴급 확인이 필요한 표현이 감지되었습니다. 아래 원문과 출처 기반 근거를 확인해 주세요.",
            "",
            analysis.caregiver_report,
            "",
            "[출처 기반 위험 근거]",
            evidenceReport,
          ].join("\n").trim(),
        };
      } else {
        analysis = {
          ...analysis,
          caregiver_report: [
            analysis.caregiver_report,
            "",
            "[출처 기반 주의 근거]",
            evidenceReport,
          ].join("\n").trim(),
        };
      }
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

    const turnIdByStep = await saveCheckinTurns(supabase, checkin.id, stepAnswers);
    await updateCareMemoryItems(supabase, userId, checkin.id, turnIdByStep, stepAnswers);

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

    if (urgentEvidence || analysis.condition_level === "urgent" || analysis.urgent_detected) {
      await createCheckinUrgentAlert({
        userId,
        familyId,
        checkinId: checkin.id,
        evidenceRisks,
        transcript: data.transcript,
        caregiverReport: analysis.caregiver_report,
      });
    }

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

export const amendTodayCheckinReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AmendReviewInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const startISO = kstStartOfTodayISO();

    const { data: checkin, error: checkinError } = await supabase
      .from("health_checkins")
      .select("id, raw_transcript, condition_level, caregiver_shared")
      .eq("senior_user_id", userId)
      .gte("checkin_at", startISO)
      .order("checkin_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (checkinError) throw new Error(checkinError.message);
    if (!checkin) throw new Error("CHECKIN_NOT_FOUND");

    const transcriptTurns = data.stepAnswers.map((answer) => ({
      role: "user" as const,
      text: answer.answer,
    }));
    const evidenceRisks = detectEvidenceBasedRisks(transcriptTurns);
    const urgentEvidence = hasUrgentEvidenceRisk(evidenceRisks);
    const correctedStepText = formatStepAnswersForTranscript(
      data.stepAnswers.map((answer) => ({
        stepId: answer.stepId as CheckinStepAnswer["stepId"],
        stepLabel: answer.stepLabel,
        question: answer.question,
        answer: answer.answer,
        answeredAt: answer.answeredAt ?? Date.now(),
        riskMatches: detectEvidenceBasedRisks([{ role: "user", text: answer.answer }]),
      })),
    );

    const correctionBlock = [
      "[사용자 수정 확인]",
      `수정 시각: ${new Date().toISOString()}`,
      correctedStepText,
    ].join("\n");

    const derived = deriveStatusesFromStepAnswers(data.stepAnswers);
    const nextCondition = urgentEvidence
      ? "urgent"
      : checkin.condition_level === "urgent"
        ? "urgent"
        : derived.condition_level ?? checkin.condition_level;

    const { data: updatedCheckin, error: updateError } = await supabase
      .from("health_checkins")
      .update({
        raw_transcript: [checkin.raw_transcript, correctionBlock].filter(Boolean).join("\n\n"),
        condition_level: nextCondition,
        meal_status: derived.meal_status,
        medicine_status: derived.medicine_status,
        pain_status: derived.pain_status,
        mood_status: derived.mood_status,
        loneliness_detected: derived.loneliness_detected,
        dizziness_detected: derived.dizziness_detected,
        urgent_detected: urgentEvidence || nextCondition === "urgent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", checkin.id)
      .select("id, checkin_at, condition_level, summary, mood_status")
      .single();
    if (updateError || !updatedCheckin) throw new Error(updateError?.message ?? "CHECKIN_UPDATE_FAILED");

    await updateCorrectedCheckinTurns(supabase, checkin.id, data.stepAnswers);

    const evidenceReport = evidenceRisks.length ? formatRiskEvidenceForReport(evidenceRisks) : "";
    const correctionReport = [
      "[사용자 수정 확인]",
      ...data.stepAnswers.map((answer) => `- ${answer.stepLabel}: ${answer.answer}`),
      evidenceReport ? "\n[수정 답변의 출처 기반 위험 근거]\n" + evidenceReport : "",
    ].join("\n");

    const { data: reportRow } = await supabase
      .from("health_reports")
      .select("caregiver_report_text, senior_report_text, recommendation_tags")
      .eq("checkin_id", checkin.id)
      .maybeSingle();

    const { data: updatedReport, error: reportError } = await supabase
      .from("health_reports")
      .update({
        senior_report_text: urgentEvidence
          ? "수정된 답변에서 바로 확인이 필요한 표현이 있었어요. 보호자나 119에 바로 연락해 주세요."
          : "수정한 내용까지 반영해 오늘 기록을 다시 정리했어요.",
        caregiver_report_text: [
          reportRow?.caregiver_report_text ?? "",
          correctionReport,
        ].filter(Boolean).join("\n\n").trim(),
        recommendation_tags: urgentEvidence
          ? Array.from(new Set([...(reportRow?.recommendation_tags ?? []), "긴급_주의"]))
          : reportRow?.recommendation_tags ?? [],
      })
      .eq("checkin_id", checkin.id)
      .select("id, senior_report_text, caregiver_report_text, recommendation_tags")
      .single();
    if (reportError || !updatedReport) throw new Error(reportError?.message ?? "REPORT_UPDATE_FAILED");

    if (urgentEvidence) {
      const { data: fullCheckin } = await supabase
        .from("health_checkins")
        .select("family_id")
        .eq("id", checkin.id)
        .maybeSingle();
      await createCheckinUrgentAlert({
        userId,
        familyId: fullCheckin?.family_id ?? null,
        checkinId: checkin.id,
        evidenceRisks,
        transcript: transcriptTurns,
        caregiverReport: updatedReport.caregiver_report_text ?? correctionReport,
      });
    }

    return {
      checkin: updatedCheckin,
      report: updatedReport,
      recommendations: [],
    };
  });

export const getCheckinOpeningMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("care_memory_items")
      .select("id, memory_type, content, confidence, observation_count, last_observed_at, evidence_checkin_id, evidence_turn_id")
      .eq("user_id", userId)
      .is("denied_at", null)
      .gte("confidence", 0.6)
      .order("last_observed_at", { ascending: false })
      .order("confidence", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      memoryType: data.memory_type,
      content: data.content,
      evidenceCheckinId: data.evidence_checkin_id,
      evidenceTurnId: data.evidence_turn_id,
      prompt: `지난 기록을 보니 ${data.content} 오늘도 편하게 확인해볼게요.`,
    };
  });

export const listCareMemoryItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("care_memory_items")
      .select("id, memory_type, normalized_key, content, confidence, observation_count, last_observed_at, evidence_checkin_id, evidence_turn_id")
      .eq("user_id", userId)
      .is("denied_at", null)
      .order("last_observed_at", { ascending: false })
      .order("confidence", { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);

    return (data ?? []).map((item) => ({
      id: item.id,
      memoryType: item.memory_type as string,
      normalizedKey: item.normalized_key as string,
      content: item.content as string,
      confidence: Number(item.confidence ?? 0),
      observationCount: Number(item.observation_count ?? 0),
      lastObservedAt: item.last_observed_at as string | null,
      evidenceCheckinId: item.evidence_checkin_id as string | null,
      evidenceTurnId: item.evidence_turn_id as string | null,
    }));
  });

export const denyCareMemoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DenyMemoryInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("care_memory_items")
      .update({
        denied_at: new Date().toISOString(),
        confidence: 0,
      })
      .eq("id", data.memoryId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordCheckinQualityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => QualityEventInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("checkin_quality_events").insert({
      user_id: userId,
      checkin_id: data.checkinId ?? null,
      status: data.status,
      duration_sec: data.durationSec,
      expected_step_count: data.expectedStepCount,
      completed_step_count: data.completedStepCount,
      missing_step_ids: data.missingStepIds,
      transcript_turn_count: data.transcriptTurnCount,
      user_turn_count: data.userTurnCount,
      assistant_turn_count: data.assistantTurnCount,
      correction_count: data.correctionCount,
      urgent_detected: data.urgentDetected,
      resumed_from_draft: data.resumedFromDraft,
      draft_reason: data.draftReason ?? null,
      issue_flags: data.issueFlags,
      audio_stats: data.audioStats,
    });
    if (error) {
      console.warn("[checkin-quality] insert failed:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  });

function mergeAnalysisTags(
  existing: AnalyzedCheckin["tags"],
  next: AnalyzedCheckin["tags"],
): AnalyzedCheckin["tags"] {
  const byTag = new Map<CheckinTag, { tag: CheckinTag; confidence: number }>();
  for (const tag of [...existing, ...next]) {
    const prev = byTag.get(tag.tag);
    if (!prev || tag.confidence > prev.confidence) byTag.set(tag.tag, tag);
  }
  return Array.from(byTag.values());
}

function dedupeEvidenceRisks<T extends { category: string; rawText: string; matchedTerms: string[] }>(
  risks: T[],
): T[] {
  const seen = new Set<string>();
  return risks.filter((risk) => {
    const key = `${risk.category}:${risk.rawText}:${risk.matchedTerms.join("|")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function createCheckinUrgentAlert(input: {
  userId: string;
  familyId: string | null;
  checkinId: string;
  evidenceRisks: ReturnType<typeof detectEvidenceBasedRisks>;
  transcript: Array<{ role: string; text: string }>;
  caregiverReport: string;
}): Promise<void> {
  if (!input.familyId) return;

  const { data: recipient, error: recipientError } = await supabaseAdmin
    .from("care_recipients")
    .select("id, display_name")
    .eq("family_id", input.familyId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (recipientError || !recipient) {
    if (recipientError) console.error("[checkin-alert] care_recipient 조회 실패:", recipientError);
    return;
  }

  const { data: existing } = await supabaseAdmin
    .from("anomaly_alerts")
    .select("id")
    .eq("rule_code", "R007")
    .eq("care_recipient_id", recipient.id)
    .eq("status", "open")
    .contains("evidence", { checkin_id: input.checkinId })
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const urgentRisks = input.evidenceRisks.filter((risk) => risk.severity === "urgent");
  const topRisk = urgentRisks[0] ?? input.evidenceRisks[0] ?? null;
  const rawText = topRisk?.rawText || input.transcript.find((turn) => turn.role === "user")?.text || "";
  const sourceNames = Array.from(
    new Set(input.evidenceRisks.flatMap((risk) => risk.sources.map((source) => source.name))),
  );

  const { error } = await supabaseAdmin.from("anomaly_alerts").insert({
    rule_code: "R007",
    care_recipient_id: recipient.id,
    severity: "critical",
    guardian_message:
      "안부전화에서 바로 확인이 필요한 표현이 기록됐어요. 진단이 아니라 확인 요청입니다. 어르신께 직접 연락해 주세요.",
    evidence: {
      source: "daily_voice_checkin",
      checkin_id: input.checkinId,
      senior_user_id: input.userId,
      recipient_name: recipient.display_name,
      raw_text: rawText,
      raw_text_excerpt: rawText.length > 160 ? rawText.slice(0, 160) + "..." : rawText,
      matched_categories: input.evidenceRisks.map((risk) => risk.category),
      matched_terms: input.evidenceRisks.flatMap((risk) => risk.matchedTerms),
      evidence_sources: sourceNames,
      caregiver_report: input.caregiverReport,
      recommended_action:
        "보호자가 직접 연락해 상태를 확인하고, 응급 증상이 의심되면 119 또는 의료 전문가에게 문의하세요.",
      policy_note:
        "앱은 응급 신고를 자동으로 판단하거나 대행하지 않으며, 보호자 확인이 필요한 표현을 전달합니다.",
    },
  });

  if (error) {
    console.error("[checkin-alert] 긴급 알림 생성 실패:", error);
  }
}

async function saveCheckinTurns(
  supabase: any,
  checkinId: string,
  stepAnswers: CheckinStepAnswer[],
): Promise<Map<string, string>> {
  if (stepAnswers.length === 0) return new Map();

  const rows = stepAnswers.map((answer, index) => ({
    checkin_id: checkinId,
    turn_index: index + 1,
    step_id: answer.stepId,
    step_label: answer.stepLabel,
    ai_question: answer.question,
    user_answer: answer.answer,
    risk_matches: answer.riskMatches ?? [],
    source_transcript_index: null,
  }));

  const { data, error } = await supabase
    .from("health_checkin_turns")
    .upsert(rows, {
      onConflict: "checkin_id,step_id",
    })
    .select("id, step_id");

  if (error) {
    console.error("[checkin-turns] 질문별 기록 저장 실패:", error);
    return new Map();
  }

  return new Map((data ?? []).map((row: { id: string; step_id: string }) => [row.step_id, row.id]));
}

async function updateCorrectedCheckinTurns(
  supabase: any,
  checkinId: string,
  stepAnswers: Array<z.infer<typeof ReviewStepAnswer>>,
): Promise<void> {
  const correctedAt = new Date().toISOString();

  for (const [index, answer] of stepAnswers.entries()) {
    const riskMatches = detectEvidenceBasedRisks([{ role: "user", text: answer.answer }]);
    const { error } = await supabase.from("health_checkin_turns").upsert(
      {
        checkin_id: checkinId,
        turn_index: index + 1,
        step_id: answer.stepId,
        step_label: answer.stepLabel,
        ai_question: answer.question,
        user_answer: answer.answer,
        risk_matches: riskMatches,
        corrected_answer: answer.answer,
        corrected_at: correctedAt,
      },
      { onConflict: "checkin_id,step_id" },
    );

    if (error) {
      console.error("[checkin-turns] 질문별 수정 기록 저장 실패:", error);
    }
  }
}

type CareMemoryCandidate = {
  memory_type: "meal" | "medicine" | "pain" | "mood" | "loneliness" | "dizziness";
  normalized_key: string;
  content: string;
  evidence_turn_id: string | null;
  confidence: number;
};

async function updateCareMemoryItems(
  supabase: any,
  userId: string,
  checkinId: string,
  turnIdByStep: Map<string, string>,
  stepAnswers: CheckinStepAnswer[],
): Promise<void> {
  const candidates = buildCareMemoryCandidates(turnIdByStep, stepAnswers);
  if (candidates.length === 0) return;

  const keys = candidates.map((candidate) => candidate.normalized_key);
  const { data: existingRows } = await supabase
    .from("care_memory_items")
    .select("normalized_key, observation_count, confidence")
    .eq("user_id", userId)
    .in("normalized_key", keys);
  const existingByKey = new Map(
    (existingRows ?? []).map((row: { normalized_key: string; observation_count: number; confidence: number }) => [
      row.normalized_key,
      row,
    ]),
  );

  const now = new Date().toISOString();
  const rows = candidates.map((candidate) => {
    const prev = existingByKey.get(candidate.normalized_key);
    const observationCount = (prev?.observation_count ?? 0) + 1;
    return {
      user_id: userId,
      memory_type: candidate.memory_type,
      normalized_key: candidate.normalized_key,
      content: candidate.content,
      evidence_checkin_id: checkinId,
      evidence_turn_id: candidate.evidence_turn_id,
      confidence: Math.min(0.95, Math.max(candidate.confidence, prev?.confidence ?? 0) + (observationCount > 1 ? 0.1 : 0)),
      observation_count: observationCount,
      last_observed_at: now,
      denied_at: null,
    };
  });

  const { error } = await supabase.from("care_memory_items").upsert(rows, {
    onConflict: "user_id,normalized_key",
  });

  if (error) {
    console.error("[care-memory] 기억 저장 실패:", error);
  }
}

function buildCareMemoryCandidates(
  turnIdByStep: Map<string, string>,
  stepAnswers: CheckinStepAnswer[],
): CareMemoryCandidate[] {
  const candidates: CareMemoryCandidate[] = [];
  const push = (candidate: CareMemoryCandidate) => {
    if (!candidates.some((item) => item.normalized_key === candidate.normalized_key)) {
      candidates.push(candidate);
    }
  };

  for (const answer of stepAnswers) {
    const text = answer.answer.trim();
    const compact = text.replace(/\s+/g, "");
    const evidenceTurnId = turnIdByStep.get(answer.stepId) ?? null;

    if (answer.stepId === "Q1_MEAL" && /(못|안|거르|굶|입맛\s*없|부족)/.test(text)) {
      push({
        memory_type: "meal",
        normalized_key: "meal_skipped_or_low_appetite",
        content: "최근 식사를 거르거나 입맛이 부족하다고 말씀하신 기록이 있어요.",
        evidence_turn_id: evidenceTurnId,
        confidence: 0.7,
      });
    }

    if (answer.stepId === "Q4_MEDICINE" && /(못|안|깜빡|빼먹|누락|아직)/.test(text)) {
      push({
        memory_type: "medicine",
        normalized_key: "medicine_needs_check",
        content: "최근 약 복용을 한 번 더 확인해야 한다고 말씀하신 기록이 있어요.",
        evidence_turn_id: evidenceTurnId,
        confidence: 0.75,
      });
    }

    if ((answer.stepId === "Q2_CONDITION" || answer.stepId === "Q3_PAIN") && /(어지러|현기증|핑돌|빙글)/.test(compact)) {
      push({
        memory_type: "dizziness",
        normalized_key: "dizziness_reported",
        content: "최근 어지러움을 말씀하신 기록이 있어요.",
        evidence_turn_id: evidenceTurnId,
        confidence: 0.75,
      });
    }

    if (answer.stepId === "Q3_PAIN" && /(아프|통증|불편|쑤시|저리)/.test(text)) {
      const part = detectPainPart(text);
      push({
        memory_type: "pain",
        normalized_key: part ? `pain_${part.key}` : "pain_general",
        content: part
          ? `최근 ${part.label} 통증이나 불편을 말씀하신 기록이 있어요.`
          : "최근 몸의 통증이나 불편을 말씀하신 기록이 있어요.",
        evidence_turn_id: evidenceTurnId,
        confidence: 0.72,
      });
    }

    if (answer.stepId === "Q5_MOOD" && /(우울|불안|힘들|기분\s*안|답답)/.test(text)) {
      push({
        memory_type: "mood",
        normalized_key: "mood_low_or_anxious",
        content: "최근 기분이 가라앉거나 불편하다고 말씀하신 기록이 있어요.",
        evidence_turn_id: evidenceTurnId,
        confidence: 0.7,
      });
    }

    if (/(외롭|쓸쓸|혼자|허전)/.test(text)) {
      push({
        memory_type: "loneliness",
        normalized_key: "loneliness_reported",
        content: "최근 외롭거나 허전하다고 말씀하신 기록이 있어요.",
        evidence_turn_id: evidenceTurnId,
        confidence: 0.72,
      });
    }
  }

  return candidates;
}

function detectPainPart(text: string): { key: string; label: string } | null {
  const candidates = [
    { key: "knee", label: "무릎", pattern: /무릎/ },
    { key: "back", label: "허리", pattern: /허리|등/ },
    { key: "shoulder", label: "어깨", pattern: /어깨/ },
    { key: "leg", label: "다리", pattern: /다리|발목|발/ },
    { key: "head", label: "머리", pattern: /머리|두통/ },
    { key: "chest", label: "가슴", pattern: /가슴|흉통/ },
    { key: "stomach", label: "배", pattern: /배|복통|속/ },
  ];
  return candidates.find((candidate) => candidate.pattern.test(text)) ?? null;
}

function deriveStatusesFromStepAnswers(
  answers: Array<z.infer<typeof ReviewStepAnswer>>,
): {
  condition_level?: "good" | "normal" | "caution";
  meal_status: string | null;
  medicine_status: string | null;
  pain_status: string | null;
  mood_status: string | null;
  loneliness_detected: boolean;
  dizziness_detected: boolean;
} {
  const byStep = new Map(answers.map((answer) => [answer.stepId, answer.answer]));
  const all = answers.map((answer) => answer.answer).join(" ");
  const meal = byStep.get("Q1_MEAL") ?? "";
  const condition = byStep.get("Q2_CONDITION") ?? "";
  const pain = byStep.get("Q3_PAIN") ?? "";
  const medicine = byStep.get("Q4_MEDICINE") ?? "";
  const mood = byStep.get("Q5_MOOD") ?? "";

  const meal_status = !meal
    ? null
    : /(못|안|거르|굶|입맛\s*없|부족)/.test(meal)
      ? "부족"
      : /(먹|드셨|챙겼|잘|정상)/.test(meal)
        ? "정상"
        : "모름";

  const medicine_status = !medicine
    ? null
    : /(못|안|깜빡|빼먹|누락|아직)/.test(medicine)
      ? "확인필요"
      : /(먹|복용|챙겼|완료|드셨)/.test(medicine)
        ? "완료"
        : "모름";

  const pain_status = !pain
    ? null
    : /(없|괜찮|안\s*아프|불편하지\s*않)/.test(pain)
      ? "없음"
      : /(아프|통증|불편|쑤시|저리|어지러|숨|가슴|쇼크)/.test(pain)
        ? "있음"
        : "모름";

  const mood_status = !mood
    ? null
    : /(좋|괜찮|편안|평온|기쁘)/.test(mood)
      ? "좋음"
      : /(우울|외롭|불안|힘들|쓸쓸|기분\s*안)/.test(mood)
        ? "저하"
        : "보통";

  const dizziness_detected = /(어지러|현기증|핑\s*돌|빙글)/.test(all);
  const loneliness_detected = /(외롭|쓸쓸|혼자|허전)/.test(all);
  const caution =
    meal_status === "부족" ||
    medicine_status === "확인필요" ||
    pain_status === "있음" ||
    mood_status === "저하" ||
    dizziness_detected ||
    loneliness_detected;

  const good =
    meal_status === "정상" &&
    (medicine_status === "완료" || medicine_status === null || medicine_status === "모름") &&
    pain_status === "없음" &&
    (mood_status === "좋음" || mood_status === "보통" || mood_status === null);

  return {
    condition_level: caution ? "caution" : good ? "good" : "normal",
    meal_status,
    medicine_status,
    pain_status,
    mood_status,
    loneliness_detected,
    dizziness_detected,
  };
}

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

    const [{ data: report }, { data: turns }] = await Promise.all([
      supabase
        .from("health_reports")
        .select("senior_report_text, recommendation_tags")
        .eq("checkin_id", checkin.id)
        .maybeSingle(),
      supabase
        .from("health_checkin_turns")
        .select("id, turn_index, step_id, step_label, ai_question, user_answer, risk_matches, corrected_answer, corrected_at")
        .eq("checkin_id", checkin.id)
        .order("turn_index", { ascending: true }),
    ]);

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

    return { checkin, report, recommendations, turns: turns ?? [] };
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
    const [{ data: reports }, { data: turns }] = await Promise.all([
      supabase
        .from("health_reports")
        .select("checkin_id, caregiver_report_text, recommendation_tags")
        .in("checkin_id", checkinIds),
      supabase
        .from("health_checkin_turns")
        .select("checkin_id, id, turn_index, step_id, step_label, ai_question, user_answer, risk_matches, corrected_answer, corrected_at")
        .in("checkin_id", checkinIds)
        .order("turn_index", { ascending: true }),
    ]);
    const reportMap = new Map((reports ?? []).map((r) => [r.checkin_id, r]));
    const turnsByCheckin = new Map<string, Array<NonNullable<typeof turns>[number]>>();
    for (const turn of turns ?? []) {
      const arr = turnsByCheckin.get(turn.checkin_id) ?? [];
      arr.push(turn);
      turnsByCheckin.set(turn.checkin_id, arr);
    }

    return checkins.map((c) => ({
      ...c,
      report: reportMap.get(c.id) ?? null,
      turns: turnsByCheckin.get(c.id) ?? [],
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
