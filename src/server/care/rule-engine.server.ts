/**
 * Rule Engine — server-side runner.
 *
 * 입력: care_recipient_id
 * 출력: anomaly_alerts insert 결과
 *
 * 원칙:
 *  - LLM 호출 없음. 모두 DB 조회 + 결정주의 규칙.
 *  - 진단형 표현 금지. guardian_message 는 관찰형/확인 요청형.
 *  - dedupe: 같은 recipient + rule_code + status='open' 이 이미 있으면 새로 생성하지 않음.
 *  - critical 규칙도 동일 dedupe 정책. (보호자가 acknowledge 하면 다시 발동 가능)
 *  - 본 단계에서는 anomaly_alerts 까지만 만들고 notification_outbox 는 다음 단계에서.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueSmsForAlertOnce } from "@/server/notifications/outbox.server";
import { isValidE164 } from "@/server/notifications/sms.server";

const SOURCE_TAG = "ai_ars_rule_v1";

export type Severity = "info" | "warning" | "critical";

export interface RuleResult {
  rule_code: string;
  severity: Severity;
  guardian_message: string;
  evidence: Record<string, unknown>;
}

export interface RuleRunResult {
  ok: boolean;
  evaluated: string[];
  fired: string[];
  inserted: number;
  deduped: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function hoursAgoIso(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function daysAgoDate(d: number): string {
  const dt = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
  return dt.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// R001 no_response_48h
//   - 최근 48시간 내 성공 통화(status='completed' & duration_sec >= 30) 0회
//   - 최근 48시간 내 발신 시도(call_sessions row) 2회 이상
// ─────────────────────────────────────────────────────────────────────────────

async function evalR001(recipientId: string): Promise<RuleResult | null> {
  const since = hoursAgoIso(48);
  const { data, error } = await supabaseAdmin
    .from("call_sessions")
    .select("id, status, duration_sec, started_at, created_at")
    .eq("care_recipient_id", recipientId)
    .gte("created_at", since);

  if (error) {
    console.error("[rule:R001] query failed", error);
    return null;
  }
  const sessions = data ?? [];
  const attempts = sessions.length;
  const success = sessions.filter(
    (s) => s.status === "completed" && (s.duration_sec ?? 0) >= 30,
  ).length;

  if (success === 0 && attempts >= 2) {
    return {
      rule_code: "R001",
      severity: "critical",
      guardian_message:
        "최근 48시간 동안 부모님과 연락이 닿지 않았어요. 직접 전화나 방문 확인이 필요합니다.",
      evidence: {
        source: SOURCE_TAG,
        window_hours: 48,
        attempts,
        success_calls: success,
      },
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// R002 meal_unconfirmed_repeat
//   - 최근 3일 daily_log meal_status in ('skipped','unknown') 가 2일 이상
// ─────────────────────────────────────────────────────────────────────────────

async function evalR002(recipientId: string): Promise<RuleResult | null> {
  const since = daysAgoDate(2); // 오늘 포함 3일
  const { data, error } = await supabaseAdmin
    .from("daily_log")
    .select("log_date, meal_status")
    .eq("care_recipient_id", recipientId)
    .gte("log_date", since);

  if (error) {
    console.error("[rule:R002] query failed", error);
    return null;
  }
  const rows = data ?? [];
  const flaggedDates = new Set<string>(
    rows
      .filter((r) => r.meal_status === "skipped" || r.meal_status === "unknown")
      .map((r) => r.log_date),
  );

  if (flaggedDates.size >= 2) {
    return {
      rule_code: "R002",
      severity: "warning",
      guardian_message:
        "최근 3일 중 2일 이상 식사 여부가 확인되지 않았어요. 오늘 식사를 직접 확인해 주세요.",
      evidence: {
        source: SOURCE_TAG,
        window_days: 3,
        flagged_dates: [...flaggedDates],
      },
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// R003 medication_missed_repeat
//   - extracted_check_results axis='medication' 최근 3일
//   - value.summary='missed' 2회 이상
//   - 또는 value.summary='unknown' 3회 이상
// ─────────────────────────────────────────────────────────────────────────────

async function evalR003(recipientId: string): Promise<RuleResult | null> {
  const since = daysAgoDate(2);
  const { data, error } = await supabaseAdmin
    .from("extracted_check_results")
    .select("recorded_for_date, value, session_id")
    .eq("care_recipient_id", recipientId)
    .eq("axis", "medication")
    .gte("recorded_for_date", since);

  if (error) {
    console.error("[rule:R003] query failed", error);
    return null;
  }
  const rows = data ?? [];

  let missed = 0;
  let unknown = 0;
  const missedDates: string[] = [];
  const unknownDates: string[] = [];

  for (const r of rows) {
    const v = (r.value ?? {}) as Record<string, unknown>;
    const summary = typeof v["summary"] === "string" ? (v["summary"] as string) : null;
    const status = typeof v["status"] === "string" ? (v["status"] as string) : null;
    const tag = summary ?? status;
    if (tag === "missed" || tag === "skipped") {
      missed++;
      missedDates.push(r.recorded_for_date);
    } else if (tag === "unknown" || tag === null) {
      unknown++;
      unknownDates.push(r.recorded_for_date);
    }
  }

  if (missed >= 2 || unknown >= 3) {
    return {
      rule_code: "R003",
      severity: "warning",
      guardian_message:
        "최근 며칠 동안 약 복용 확인이 반복적으로 되지 않았어요. 복용 여부를 직접 확인해 주세요.",
      evidence: {
        source: SOURCE_TAG,
        window_days: 3,
        missed_count: missed,
        unknown_count: unknown,
        missed_dates: missedDates,
        unknown_dates: unknownDates,
      },
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// R004 high_risk_phrase
//   - symptoms_log 최근 24시간, category in ('breath','chest_pain','fall'), severity='high'
// ─────────────────────────────────────────────────────────────────────────────

async function evalR004(recipientId: string): Promise<RuleResult | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("symptoms_log")
    .select("category, severity, keywords, session_id, created_at")
    .eq("care_recipient_id", recipientId)
    .in("category", ["breath", "chest_pain", "fall"])
    .eq("severity", "high")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[rule:R004] query failed", error);
    return null;
  }
  const rows = data ?? [];
  if (rows.length === 0) return null;

  const top = rows[0];
  const excerpt = Array.isArray(top.keywords) && top.keywords.length > 0
    ? String(top.keywords[0])
    : null;

  return {
    rule_code: "R004",
    severity: "critical",
    guardian_message:
      "최근 안부 통화에서 바로 확인이 필요한 표현이 기록되었어요. 부모님께 직접 연락해 주세요.",
    evidence: {
      source: SOURCE_TAG,
      window_hours: 24,
      matched_axis: "symptom",
      session_id: top.session_id,
      category: top.category,
      raw_text_excerpt: excerpt,
      hits: rows.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

const EVALUATORS: Array<{
  code: string;
  fn: (recipientId: string) => Promise<RuleResult | null>;
}> = [
  { code: "R001", fn: evalR001 },
  { code: "R002", fn: evalR002 },
  { code: "R003", fn: evalR003 },
  { code: "R004", fn: evalR004 },
];

/**
 * 한 recipient 에 대해 R001~R004 평가 후 anomaly_alerts insert.
 *
 * dedupe:
 *   동일 (care_recipient_id, rule_code, status='open') 이 이미 있으면 skip.
 */
export async function runRulesForRecipient(recipientId: string): Promise<RuleRunResult> {
  const evaluated: string[] = [];
  const fired: string[] = [];
  let inserted = 0;
  let deduped = 0;

  for (const { code, fn } of EVALUATORS) {
    evaluated.push(code);
    let result: RuleResult | null = null;
    try {
      result = await fn(recipientId);
    } catch (err) {
      console.error(`[rule:${code}] evaluation threw`, err);
      continue;
    }
    if (!result) continue;

    fired.push(code);

    // dedupe: 같은 rule_code 가 이미 open 상태로 있으면 건너뜀
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("anomaly_alerts")
      .select("id")
      .eq("care_recipient_id", recipientId)
      .eq("rule_code", code)
      .eq("status", "open")
      .limit(1);

    if (existingErr) {
      console.error(`[rule:${code}] dedupe query failed`, existingErr);
      continue;
    }
    if (existing && existing.length > 0) {
      deduped++;
      continue;
    }

    const insRes = await supabaseAdmin
      .from("anomaly_alerts")
      .insert([
        {
          care_recipient_id: recipientId,
          rule_code: result.rule_code,
          severity: result.severity,
          guardian_message: result.guardian_message,
          evidence: result.evidence as never,
          status: "open",
        },
      ])
      .select("id")
      .single();

    if (insRes.error || !insRes.data) {
      console.error(`[rule:${code}] insert failed`, insRes.error);
      continue;
    }
    inserted++;

    // critical → guardian SMS enqueue (notification_outbox). 실패해도 룰 흐름은 계속.
    if (result.severity === "critical") {
      try {
        await enqueueGuardianCriticalSms({
          recipientId,
          alertId: insRes.data.id,
        });
      } catch (err) {
        console.error(`[rule:${code}] guardian enqueue failed`, err);
      }
    }
  }

  return { ok: true, evaluated, fired, inserted, deduped };
}

/**
 * 전체 active recipient 에 대해 일괄 실행 (cron 용).
 */
export async function runRulesForAllRecipients(): Promise<{
  ok: boolean;
  recipients: number;
  totalInserted: number;
  totalDeduped: number;
}> {
  const { data, error } = await supabaseAdmin
    .from("care_recipients")
    .select("id")
    .eq("status", "active");

  if (error) {
    console.error("[rule-engine] recipient list failed", error);
    return { ok: false, recipients: 0, totalInserted: 0, totalDeduped: 0 };
  }

  let totalInserted = 0;
  let totalDeduped = 0;
  for (const r of data ?? []) {
    const res = await runRulesForRecipient(r.id);
    totalInserted += res.inserted;
    totalDeduped += res.deduped;
  }
  return {
    ok: true,
    recipients: (data ?? []).length,
    totalInserted,
    totalDeduped,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Guardian critical SMS enqueue
//   - 같은 family 의 primary_guardian 우선, 없으면 다른 가족 구성원도 시도.
//   - phone_e164 누락은 skip + log.
//   - alert_id + template_code 기준 dedupe (enqueueSmsForAlertOnce).
// ─────────────────────────────────────────────────────────────────────────────

const GUARDIAN_TEMPLATE = "guardian_critical_v1";

async function enqueueGuardianCriticalSms(params: {
  recipientId: string;
  alertId: string;
}): Promise<void> {
  const recip = await supabaseAdmin
    .from("care_recipients")
    .select("id, family_id, display_name")
    .eq("id", params.recipientId)
    .maybeSingle();
  if (recip.error || !recip.data) {
    console.warn("[rule-engine] recipient not found for guardian sms", params.recipientId);
    return;
  }

  const members = await supabaseAdmin
    .from("family_members")
    .select("id, role, phone_e164")
    .eq("family_id", recip.data.family_id);
  if (members.error) {
    console.error("[rule-engine] family_members query failed", members.error);
    return;
  }

  const list = members.data ?? [];
  // primary_guardian 우선, 그 다음 secondary, 그 외
  const ordered = [
    ...list.filter((m) => m.role === "primary_guardian"),
    ...list.filter((m) => m.role === "secondary_guardian"),
    ...list.filter((m) => m.role !== "primary_guardian" && m.role !== "secondary_guardian"),
  ];

  const name = recip.data.display_name ?? "부모님";
  const body =
    `${name}님 안부 확인이 필요합니다. 최근 통화에서 바로 확인이 필요한 신호가 기록됐어요. 대시보드에서 확인해 주세요.`;

  let enqueued = 0;
  for (const m of ordered) {
    if (!isValidE164(m.phone_e164)) continue;
    const res = await enqueueSmsForAlertOnce({
      recipient: m.phone_e164!,
      body,
      templateCode: GUARDIAN_TEMPLATE,
      alertId: params.alertId,
      metadata: {
        kind: "guardian_critical",
        family_member_id: m.id,
        recipient_name: name,
      },
    });
    if (res.ok && !res.deduped) enqueued++;
    if (res.ok && res.deduped) {
      // 이 alert 에 대해 같은 템플릿이 이미 있으면 더 보내지 않음
      break;
    }
    // 첫 유효 보호자에게 보내고 종료 (스팸 방지)
    if (res.ok && enqueued === 1) break;
  }

  if (enqueued === 0) {
    console.warn(
      "[rule-engine] no guardian phone available or all deduped",
      params.recipientId,
      params.alertId,
    );
  }
}
