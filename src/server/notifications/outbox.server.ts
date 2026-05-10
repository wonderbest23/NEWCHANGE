/**
 * notification_outbox helpers (server-only).
 *
 * 컬럼 매핑 (현재 schema):
 *   - id, alert_id?, channel, template_code, recipient (phone E.164),
 *     payload jsonb, status, attempt_count smallint, last_error,
 *     scheduled_at, sent_at, created_at
 *   - provider_message_id 컬럼은 없음 → payload.provider_sid 에 저장.
 *
 * 정책:
 *   - dispatcher 가 status='queued' 만 집어감.
 *   - 발송 시도 직전 status='sending' 으로 짧게 마킹하지 않고, 단일 트랜잭션 없이
 *     attempt_count 증분 + 결과로 sent/queued/failed 결정.
 *   - retry: attempt_count >= MAX_ATTEMPTS 면 failed.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSms, type SmsMessageType } from "./sms.server";

export const MAX_OUTBOX_ATTEMPTS = 3;

export interface EnqueueSmsParams {
  recipient: string;          // E.164
  body: string;
  templateCode: string;       // ex) 'parent_call_fallback_v1', 'guardian_critical_v1'
  alertId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface EnqueueResult {
  ok: boolean;
  outboxId?: string;
  deduped?: boolean;
  error?: string;
}

/**
 * 단순 enqueue. 호출자가 dedupe 필요시 직접 체크 후 호출하거나,
 * dedupeKey 를 payload.dedupe_key 로 넣고 사전 조회한다.
 */
export async function enqueueSms(params: EnqueueSmsParams): Promise<EnqueueResult> {
  const payload = {
    body: params.body,
    ...(params.metadata ?? {}),
  };
  const ins = await supabaseAdmin
    .from("notification_outbox")
    .insert([
      {
        channel: "sms",
        template_code: params.templateCode,
        recipient: params.recipient,
        alert_id: params.alertId ?? null,
        payload: payload as never,
        status: "queued",
      },
    ])
    .select("id")
    .single();
  if (ins.error || !ins.data) {
    return { ok: false, error: ins.error?.message ?? "insert_failed" };
  }
  return { ok: true, outboxId: ins.data.id };
}

/**
 * alert_id 기준 dedupe enqueue.
 * 같은 alert_id + template_code 가 이미 존재(queued|sending|sent)면 skip.
 */
export async function enqueueSmsForAlertOnce(params: EnqueueSmsParams): Promise<EnqueueResult> {
  if (!params.alertId) return enqueueSms(params);
  const existing = await supabaseAdmin
    .from("notification_outbox")
    .select("id")
    .eq("alert_id", params.alertId)
    .eq("template_code", params.templateCode)
    .in("status", ["queued", "sending", "sent"])
    .limit(1);
  if (existing.error) {
    return { ok: false, error: existing.error.message };
  }
  if (existing.data && existing.data.length > 0) {
    return { ok: true, outboxId: existing.data[0].id, deduped: true };
  }
  return enqueueSms(params);
}

export interface DispatchResult {
  ok: boolean;
  considered: number;
  sent: number;
  failed: number;
  retried: number;
  errors: Array<{ id: string; error: string }>;
}

const TYPE_BY_TEMPLATE: Record<string, SmsMessageType> = {
  parent_call_fallback_v1: "parent_call_fallback",
  guardian_critical_v1: "guardian_alert",
};

/**
 * outbox dispatcher. SMS만 처리.
 */
export async function dispatchOutbox(limit = 50): Promise<DispatchResult> {
  const result: DispatchResult = {
    ok: true,
    considered: 0,
    sent: 0,
    failed: 0,
    retried: 0,
    errors: [],
  };

  const { data, error } = await supabaseAdmin
    .from("notification_outbox")
    .select("id, channel, template_code, recipient, payload, attempt_count, status")
    .eq("channel", "sms")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return { ...result, ok: false, errors: [{ id: "-", error: error.message }] };
  }

  result.considered = data?.length ?? 0;

  for (const row of data ?? []) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const body = typeof payload["body"] === "string" ? (payload["body"] as string) : "";
    const messageType = TYPE_BY_TEMPLATE[row.template_code] ?? "test";

    if (!body || !row.recipient) {
      const upd = await supabaseAdmin
        .from("notification_outbox")
        .update({
          status: "failed",
          last_error: !body ? "empty_body" : "empty_recipient",
        } as never)
        .eq("id", row.id);
      if (upd.error) result.errors.push({ id: row.id, error: upd.error.message });
      result.failed++;
      continue;
    }

    const sendRes = await sendSms({
      to: row.recipient,
      body,
      messageType,
      metadata: { outbox_id: row.id, template: row.template_code },
    });

    const nextAttempt = (row.attempt_count ?? 0) + 1;

    if (sendRes.ok) {
      const newPayload = { ...payload, provider_sid: sendRes.sid ?? null };
      const upd = await supabaseAdmin
        .from("notification_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempt_count: nextAttempt,
          payload: newPayload as never,
          last_error: null,
        } as never)
        .eq("id", row.id);
      if (upd.error) {
        result.errors.push({ id: row.id, error: upd.error.message });
      }
      result.sent++;
    } else {
      const failNow = nextAttempt >= MAX_OUTBOX_ATTEMPTS;
      const upd = await supabaseAdmin
        .from("notification_outbox")
        .update({
          status: failNow ? "failed" : "queued",
          attempt_count: nextAttempt,
          last_error: sendRes.error ?? "unknown_error",
        } as never)
        .eq("id", row.id);
      if (upd.error) {
        result.errors.push({ id: row.id, error: upd.error.message });
      }
      if (failNow) result.failed++;
      else result.retried++;
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward compat (simulator): enqueueAllAlerts
//   simulator.functions.ts 가 사용하는 레거시 시그니처. 본 단계 5의 새로운
//   enqueueSmsForAlertOnce / dispatchOutbox 흐름과 별도이며, 시뮬레이터의
//   자체 outbox 라이프사이클만 흉내낸다 (실제 발송 X).
// ─────────────────────────────────────────────────────────────────────────────

export interface LegacyEnqueueResult {
  alert_id: string;
  enqueued: number;
  skipped_reason?: string;
}

interface LegacyFiredRule {
  rule_code: string;
  severity: string;
  guardian_message: string;
  evidence?: Record<string, unknown>;
}

/**
 * @deprecated 본 단계의 enqueueSmsForAlertOnce 사용 권장. simulator 호환용.
 */
export async function enqueueAllAlerts(
  _recipientId: string,
  fired: LegacyFiredRule[],
): Promise<LegacyEnqueueResult[]> {
  return fired.map((f) => ({
    alert_id: "",
    enqueued: 0,
    skipped_reason: `simulator_noop:${f.rule_code}`,
  }));
}
