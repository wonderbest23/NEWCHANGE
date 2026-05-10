/**
 * Extraction — call_turns → extracted_check_results / daily_log / symptoms_log
 *
 * 원칙:
 *  - 100% 규칙 기반 (한국어 키워드/패턴).
 *  - 추가 AI 공급자 호출 없음 (OpenAI 포함).
 *  - axis 별 1세션 1행 (중복 방지: 동일 session_id+axis 가 이미 있으면 skip).
 *
 * 입력: session_id
 * 출력: { axes: ['meal','medication',...], inserted: N, skipped: M }
 *
 * 주의:
 *  - 저장값은 관찰형(observational)만. "우울증 의심" 같은 진단형 표현 금지.
 *  - help_needed/symptom 의 high-risk 는 extraction 단계에서 진단/알림 생성 X
 *    (anomaly_alerts 는 다음 단계에서 별도 rule engine 이 처리).
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { QuestionId } from "./types";

const SOURCE_TAG = "ai_ars_rule_v1";

// ─────────────────────────────────────────────────────────────────────────────
// Question → Axis 매핑
//   주의: state-machine 의 QuestionId 와 실제로 사용되는 Q 카탈로그 (state-machine.ts)
//   은 다음과 같다:
//     Q1_MOOD       → mood
//     Q2_MEAL       → meal      (+ Q2A_MEAL_REASON 으로 reason 보강)
//     Q3_MEDICATION → medication (+ Q3A_MED_REASON 으로 reason 보강)
//     Q4_SYMPTOM    → symptom    (+ Q4A_SYMPTOM_DETAIL 로 detail 보강)
//     Q5_SLEEP      → sleep
//     Q6_HELP       → help       (+ Q6A_HELP_DETAIL 로 detail 보강)
// ─────────────────────────────────────────────────────────────────────────────

type AxisCode = "meal" | "medication" | "symptom" | "mood" | "sleep" | "help";

const AXIS_BY_QID: Partial<Record<QuestionId, AxisCode>> = {
  Q1_MOOD: "mood",
  Q2_MEAL: "meal",
  Q2A_MEAL_REASON: "meal",
  Q3_MEDICATION: "medication",
  Q3A_MED_REASON: "medication",
  Q4_SYMPTOM: "symptom",
  Q4A_SYMPTOM_DETAIL: "symptom",
  Q5_SLEEP: "sleep",
  Q6_HELP: "help",
  Q6A_HELP_DETAIL: "help",
};

// ─────────────────────────────────────────────────────────────────────────────
// 분류기 (한국어 정규식)
// ─────────────────────────────────────────────────────────────────────────────

interface ClassifyResult<T> {
  status: T;
  confidence: number;
  matched?: string;
}

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function unclear(text: string): boolean {
  return /(모르겠|기억\s*안|글쎄|잘\s*모름)/.test(text);
}

// ── meal ───────────────────────────────────────────────────────────────────
type MealStatus = "eaten" | "skipped" | "partial" | "unknown";

export function classifyMeal(text: string): ClassifyResult<MealStatus> {
  const t = clean(text);
  if (!t) return { status: "unknown", confidence: 0 };
  if (unclear(t)) return { status: "unknown", confidence: 0.6 };

  let m = t.match(/(조금|반\s*만|반\s*그릇|일부)/);
  if (m) return { status: "partial", confidence: 0.8, matched: m[0] };

  m = t.match(/(못\s*먹|안\s*먹|입맛이?\s*없|식사\s*안|굶|건너뜀)/);
  if (m) return { status: "skipped", confidence: 0.85, matched: m[0] };

  m = t.match(/(먹었|먹음|먹고|식사\s*함|식사\s*했|밥\s*먹|챙겨\s*먹)/);
  if (m) return { status: "eaten", confidence: 0.85, matched: m[0] };

  return { status: "unknown", confidence: 0.3 };
}

// ── medication ─────────────────────────────────────────────────────────────
type MedStatus = "taken" | "partial" | "missed" | "unknown" | "no_meds";

export function classifyMedication(text: string): ClassifyResult<MedStatus> {
  const t = clean(text);
  if (!t) return { status: "unknown", confidence: 0 };

  let m = t.match(/(먹는\s*약\s*없|약\s*없어|복용\s*약\s*없)/);
  if (m) return { status: "no_meds", confidence: 0.9, matched: m[0] };

  if (unclear(t)) return { status: "unknown", confidence: 0.6 };

  m = t.match(/(일부만|하나는?\s*먹|반만\s*먹|아침만\s*먹|저녁만\s*먹)/);
  if (m) return { status: "partial", confidence: 0.8, matched: m[0] };

  m = t.match(/(안\s*먹|못\s*먹|깜빡|잊어|빼먹|건너뜀)/);
  if (m) return { status: "missed", confidence: 0.85, matched: m[0] };

  m = t.match(/(챙겨\s*먹|복용했|복용함|약\s*먹었|먹었어|먹음)/);
  if (m) return { status: "taken", confidence: 0.85, matched: m[0] };

  return { status: "unknown", confidence: 0.3 };
}

// ── symptom ────────────────────────────────────────────────────────────────
type SymptomCategory =
  | "none"
  | "pain"
  | "dizzy"
  | "breath"
  | "chest_pain"
  | "fall"
  | "cough"
  | "other";
type SymptomSeverity = "none" | "mild" | "moderate" | "high";

export interface SymptomResult {
  category: SymptomCategory;
  severity: SymptomSeverity;
  confidence: number;
  matched?: string;
  keywords: string[];
}

export function classifySymptom(text: string): SymptomResult {
  const t = clean(text);
  if (!t) return { category: "none", severity: "none", confidence: 0, keywords: [] };

  // 명시적 부재
  if (/(없어|괜찮|이상\s*없|불편한\s*것?\s*없)/.test(t) && !/아프|아파|불편/.test(t)) {
    return { category: "none", severity: "none", confidence: 0.85, keywords: [] };
  }

  const keywords: string[] = [];
  let category: SymptomCategory = "other";
  let severity: SymptomSeverity = "mild";
  let matched: string | undefined;

  // 고위험 우선
  let m = t.match(/(숨이?\s*(차|막|안\s*쉬)|호흡\s*곤란|숨쉬기\s*힘)/);
  if (m) {
    keywords.push("breath");
    return { category: "breath", severity: "high", confidence: 0.9, matched: m[0], keywords };
  }
  m = t.match(/(가슴이?\s*(아프|아파|답답|조이))/);
  if (m) {
    keywords.push("chest_pain");
    return { category: "chest_pain", severity: "high", confidence: 0.9, matched: m[0], keywords };
  }
  m = t.match(/(넘어졌|쓰러졌|미끄러졌|낙상)/);
  if (m) {
    keywords.push("fall");
    return { category: "fall", severity: "high", confidence: 0.9, matched: m[0], keywords };
  }

  // 중간/일반
  m = t.match(/(어지러|어지럽|현기증)/);
  if (m) {
    keywords.push("dizzy");
    category = "dizzy";
    matched = m[0];
    severity = "moderate";
  }
  m = t.match(/(기침|콜록)/);
  if (m) {
    keywords.push("cough");
    if (category === "other") {
      category = "cough";
      matched = m[0];
    }
  }
  m = t.match(/(아프|아파|쑤시|결림|통증)/);
  if (m) {
    keywords.push("pain");
    if (category === "other" || category === "dizzy") {
      category = "pain";
      matched = m[0];
    }
    if (severity === "mild") severity = "moderate";
  }

  if (keywords.length === 0) {
    if (unclear(t)) return { category: "other", severity: "mild", confidence: 0.4, keywords: [] };
    // 매칭 없음 → none 으로 보수 처리
    return { category: "none", severity: "none", confidence: 0.5, keywords: [] };
  }

  return {
    category,
    severity,
    confidence: severity === "moderate" ? 0.75 : 0.7,
    matched,
    keywords,
  };
}

// ── mood ───────────────────────────────────────────────────────────────────
type MoodStatus = "good" | "ok" | "down" | "anxious" | "unknown";

export function classifyMood(text: string): ClassifyResult<MoodStatus> {
  const t = clean(text);
  if (!t) return { status: "unknown", confidence: 0 };
  if (unclear(t)) return { status: "unknown", confidence: 0.6 };

  let m = t.match(/(불안|걱정|초조)/);
  if (m) return { status: "anxious", confidence: 0.8, matched: m[0] };

  m = t.match(/(우울|쓸쓸|외로|허전|기운이?\s*없|울적|살기\s*힘)/);
  if (m) return { status: "down", confidence: 0.8, matched: m[0] };

  m = t.match(/(좋아|좋다|좋음|기분\s*좋|괜찮|편안|행복)/);
  if (m) return { status: "good", confidence: 0.8, matched: m[0] };

  m = t.match(/(그냥\s*그래|보통|그저\s*그래|그럭저럭)/);
  if (m) return { status: "ok", confidence: 0.75, matched: m[0] };

  return { status: "unknown", confidence: 0.3 };
}

// ── sleep ──────────────────────────────────────────────────────────────────
type SleepStatus = "well" | "poor" | "unknown";

export function classifySleep(text: string): ClassifyResult<SleepStatus> {
  const t = clean(text);
  if (!t) return { status: "unknown", confidence: 0 };
  if (unclear(t)) return { status: "unknown", confidence: 0.6 };

  let m = t.match(/(못\s*잤|잠을?\s*설|뒤척|깊이\s*못|자다\s*깨|새벽에?\s*깸|불면)/);
  if (m) return { status: "poor", confidence: 0.85, matched: m[0] };

  m = t.match(/(잘\s*잤|푹\s*잤|편히\s*잤|잘\s*잠)/);
  if (m) return { status: "well", confidence: 0.85, matched: m[0] };

  return { status: "unknown", confidence: 0.3 };
}

// ── help ───────────────────────────────────────────────────────────────────
interface HelpResult {
  help_needed: boolean | "unknown";
  confidence: number;
  matched?: string;
}

export function classifyHelp(text: string): HelpResult {
  const t = clean(text);
  if (!t) return { help_needed: "unknown", confidence: 0 };
  if (unclear(t)) return { help_needed: "unknown", confidence: 0.6 };

  let m = t.match(/(와\s*줬으면|와줘|전화\s*해|병원\s*가|도와줘|부탁|연락\s*해)/);
  if (m) return { help_needed: true, confidence: 0.85, matched: m[0] };

  m = t.match(/(없어|필요\s*없|괜찮|아니|없습니다)/);
  if (m) return { help_needed: false, confidence: 0.8, matched: m[0] };

  return { help_needed: "unknown", confidence: 0.3 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 entry — extractFromSession
// ─────────────────────────────────────────────────────────────────────────────

interface TurnRow {
  id: string;
  turn_index: number;
  question_id: string | null;
  raw_text: string | null;
  is_unclear: boolean;
  classified_value: unknown;
}

interface SessionRow {
  id: string;
  care_recipient_id: string;
  started_at: string | null;
  created_at: string;
}

export interface ExtractionResult {
  ok: boolean;
  sessionId: string;
  axesInserted: string[];
  axesSkipped: string[];
  symptomsInserted: number;
  dailyLogUpserted: boolean;
  error?: string;
}

/** 같은 axis 가 같은 session 에 이미 있으면 두 번 저장하지 않음 */
async function existingAxes(sessionId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("extracted_check_results")
    .select("axis")
    .eq("session_id", sessionId);
  const out = new Set<string>();
  for (const row of data ?? []) {
    if (row && typeof (row as { axis?: unknown }).axis === "string") {
      out.add((row as { axis: string }).axis);
    }
  }
  return out;
}

export async function extractFromSession(sessionId: string): Promise<ExtractionResult> {
  // 1. session 조회
  const sess = await supabaseAdmin
    .from("call_sessions")
    .select("id, care_recipient_id, started_at, created_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sess.error || !sess.data) {
    return {
      ok: false,
      sessionId,
      axesInserted: [],
      axesSkipped: [],
      symptomsInserted: 0,
      dailyLogUpserted: false,
      error: "session_not_found",
    };
  }
  const session = sess.data as SessionRow;

  // 2. turns 조회 (사용자 turn 만 의미 있음 — call_turns.role='user')
  const turnsRes = await supabaseAdmin
    .from("call_turns")
    .select("id, turn_index, question_id, raw_text, is_unclear, classified_value")
    .eq("session_id", sessionId)
    .eq("role", "user")
    .order("turn_index", { ascending: true });
  if (turnsRes.error) {
    return {
      ok: false,
      sessionId,
      axesInserted: [],
      axesSkipped: [],
      symptomsInserted: 0,
      dailyLogUpserted: false,
      error: turnsRes.error.message,
    };
  }
  const turns = (turnsRes.data ?? []) as TurnRow[];

  // 3. axis 별로 turn 묶기 (보조질문 텍스트도 합쳐서 분류 정확도 ↑)
  const byAxis: Record<AxisCode, string[]> = {
    meal: [],
    medication: [],
    symptom: [],
    mood: [],
    sleep: [],
    help: [],
  };
  for (const t of turns) {
    if (t.is_unclear) continue;
    const axis = t.question_id ? AXIS_BY_QID[t.question_id as QuestionId] : undefined;
    if (!axis) continue;
    const text = clean(t.raw_text);
    if (text) byAxis[axis].push(text);
  }

  // 4. 각 axis 분류
  const recordedFor = (session.started_at ?? session.created_at).slice(0, 10); // YYYY-MM-DD

  const already = await existingAxes(sessionId);
  const inserts: Array<{
    axis: AxisCode;
    value: Record<string, unknown>;
  }> = [];

  // -- meal
  if (byAxis.meal.length) {
    const joined = byAxis.meal.join(" / ");
    const c = classifyMeal(joined);
    inserts.push({
      axis: "meal",
      value: {
        status: c.status,
        raw_text: joined,
        confidence: c.confidence,
        matched: c.matched,
        source: SOURCE_TAG,
      },
    });
  }
  // -- medication (today summary only)
  if (byAxis.medication.length) {
    const joined = byAxis.medication.join(" / ");
    const c = classifyMedication(joined);
    inserts.push({
      axis: "medication",
      value: {
        status: c.status,
        raw_text: joined,
        confidence: c.confidence,
        matched: c.matched,
        source: SOURCE_TAG,
        scope: "today_summary",
      },
    });
  }
  // -- symptom
  let symptomResult: SymptomResult | null = null;
  if (byAxis.symptom.length) {
    const joined = byAxis.symptom.join(" / ");
    symptomResult = classifySymptom(joined);
    inserts.push({
      axis: "symptom",
      value: {
        category: symptomResult.category,
        severity: symptomResult.severity,
        keywords: symptomResult.keywords,
        raw_text: joined,
        confidence: symptomResult.confidence,
        matched: symptomResult.matched,
        source: SOURCE_TAG,
      },
    });
  }
  // -- mood
  let moodStatus: MoodStatus | null = null;
  if (byAxis.mood.length) {
    const joined = byAxis.mood.join(" / ");
    const c = classifyMood(joined);
    moodStatus = c.status;
    inserts.push({
      axis: "mood",
      value: {
        status: c.status,
        raw_text: joined,
        confidence: c.confidence,
        matched: c.matched,
        source: SOURCE_TAG,
      },
    });
  }
  // -- sleep
  let sleepStatus: SleepStatus | null = null;
  if (byAxis.sleep.length) {
    const joined = byAxis.sleep.join(" / ");
    const c = classifySleep(joined);
    sleepStatus = c.status;
    inserts.push({
      axis: "sleep",
      value: {
        status: c.status,
        raw_text: joined,
        confidence: c.confidence,
        matched: c.matched,
        source: SOURCE_TAG,
      },
    });
  }
  // -- help
  if (byAxis.help.length) {
    const joined = byAxis.help.join(" / ");
    const c = classifyHelp(joined);
    inserts.push({
      axis: "help",
      value: {
        help_needed: c.help_needed,
        raw_text: joined,
        confidence: c.confidence,
        matched: c.matched,
        source: SOURCE_TAG,
      },
    });
  }

  // 5. extracted_check_results insert (axis 별 1행, 중복 skip)
  const axesInserted: string[] = [];
  const axesSkipped: string[] = [];
  for (const row of inserts) {
    if (already.has(row.axis)) {
      axesSkipped.push(row.axis);
      continue;
    }
    const { error } = await supabaseAdmin.from("extracted_check_results").insert({
      session_id: sessionId,
      care_recipient_id: session.care_recipient_id,
      recorded_for_date: recordedFor,
      axis: row.axis,
      value: row.value as never,
    } as never);
    if (error) {
      console.error("[extraction] insert failed", row.axis, error);
      axesSkipped.push(row.axis);
    } else {
      axesInserted.push(row.axis);
    }
  }

  // 6. symptoms_log — symptom 이 none 이 아닐 때만 1행 기록
  let symptomsInserted = 0;
  if (
    symptomResult &&
    symptomResult.category !== "none" &&
    symptomResult.severity !== "none"
  ) {
    const { error } = await supabaseAdmin.from("symptoms_log").insert({
      care_recipient_id: session.care_recipient_id,
      session_id: sessionId,
      occurred_on: recordedFor,
      category: symptomResult.category,
      severity: symptomResult.severity,
      keywords: symptomResult.keywords,
    } as never);
    if (error) {
      console.error("[extraction] symptoms_log insert failed", error);
    } else {
      symptomsInserted = 1;
    }
  }

  // 7. daily_log — 동일 (care_recipient, log_date) 가 있으면 patch, 없으면 insert
  const dailyPatch: Record<string, unknown> = {};
  // meal_status: 'eaten'|'skipped'|'partial'|'unknown' 그대로
  const mealValue = inserts.find((i) => i.axis === "meal")?.value;
  if (mealValue && typeof mealValue.status === "string") {
    dailyPatch.meal_status = mealValue.status;
  }
  if (sleepStatus) dailyPatch.sleep_status = sleepStatus;
  if (moodStatus) dailyPatch.mood_status = moodStatus;
  // activity_note: help / symptom raw_text 의 압축 요약 (관찰형만)
  const helpValue = inserts.find((i) => i.axis === "help")?.value as
    | { raw_text?: string }
    | undefined;
  const symptomValue = inserts.find((i) => i.axis === "symptom")?.value as
    | { raw_text?: string }
    | undefined;
  const noteParts: string[] = [];
  if (symptomValue?.raw_text) noteParts.push(`증상: ${symptomValue.raw_text}`);
  if (helpValue?.raw_text) noteParts.push(`도움: ${helpValue.raw_text}`);
  if (noteParts.length) dailyPatch.activity_note = noteParts.join(" | ").slice(0, 500);

  let dailyLogUpserted = false;
  if (Object.keys(dailyPatch).length > 0) {
    const existing = await supabaseAdmin
      .from("daily_log")
      .select("id")
      .eq("care_recipient_id", session.care_recipient_id)
      .eq("log_date", recordedFor)
      .maybeSingle();
    if (existing.data?.id) {
      const { error } = await supabaseAdmin
        .from("daily_log")
        .update(dailyPatch as never)
        .eq("id", existing.data.id);
      if (error) console.error("[extraction] daily_log update failed", error);
      else dailyLogUpserted = true;
    } else {
      const { error } = await supabaseAdmin.from("daily_log").insert({
        care_recipient_id: session.care_recipient_id,
        log_date: recordedFor,
        ...dailyPatch,
      } as never);
      if (error) console.error("[extraction] daily_log insert failed", error);
      else dailyLogUpserted = true;
    }
  }

  return {
    ok: true,
    sessionId,
    axesInserted,
    axesSkipped,
    symptomsInserted,
    dailyLogUpserted,
  };
}
