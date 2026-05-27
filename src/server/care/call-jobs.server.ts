/**
 * Outbound call job helpers.
 *
 * - createImmediateCallJob: 보호자가 "지금 안부 전화" 누르면 사용할 수 있는 server fn.
 *   * 호출자(profile)가 해당 care_recipient의 가족인지 확인 후 insert.
 *   * 이번 단계에서는 UI에 연결하지 않음 — 함수만 준비.
 *
 * - isWithinCallWindow: 현재 시각이 [window_start, window_end] 안에 있는지 검사
 *   (Asia/Seoul 기준; recipient.timezone이 다르면 그 timezone 기준)
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export { isWithinCallWindow } from "./call-jobs.shared";
export { createImmediateCallJob } from "./call-jobs.functions";
export type { CreateImmediateJobResult } from "./call-jobs.functions";

// ─────────────────────────────────────────────────────────────────────────────
// No-answer fallback handler
//
// 정책 (reason별 차등):
//   - reason='no_answer' (부재중):
//       parent_job.retry_count < 1 → 30분 뒤 retry job 생성
//       이미 retry 했으면 → 부모님 SMS fallback enqueue
//   - reason='busy' (통화 중):
//       parent_job.retry_count < 1 → 10분 뒤 retry (부재중보다 짧게)
//       이미 retry 했으면 → SMS fallback
//   - reason='failed' (Twilio 자체 에러):
//       retry 하지 않음 — 같은 에러가 반복될 가능성이 높고 비용만 발생.
//       SMS fallback도 보내지 않음 — 부모님 잘못이 아님. 운영 알림만 로그.
//
// 멱등성:
//   - 같은 parent_job_id 의 retry job이 이미 있으면 skip
//   - 같은 session_id 의 sms fallback이 이미 enqueue 되어 있으면 skip
// ─────────────────────────────────────────────────────────────────────────────

import { enqueueSms } from "@/server/notifications/outbox.server";
import { isValidE164 } from "@/server/notifications/sms.server";

const PARENT_FALLBACK_TEMPLATE = "parent_call_fallback_v1";
const PARENT_FALLBACK_BODY =
  "안부 전화를 못 받으셨어요. 괜찮으면 1, 식사를 못 했으면 2, 몸이 불편하면 3, 전화가 필요하면 4를 답장해주세요.";

export type NoAnswerReason = "no_answer" | "busy" | "failed";

export interface NoAnswerFallbackResult {
  ok: boolean;
  action:
    | "retry_scheduled"
    | "sms_enqueued"
    | "sms_already_enqueued"
    | "retry_already_scheduled"
    | "skipped_failed_no_retry"
    | "skipped"
    | "no_phone";
  jobId?: string;
  outboxId?: string;
  reason?: string;
}

const RETRY_DELAY_MIN: Record<NoAnswerReason, number> = {
  no_answer: 30,
  busy: 10,
  // failed → not retried; entry kept so the type stays exhaustive.
  failed: 0,
};

export async function handleNoAnswerFallback(params: {
  sessionId: string;
  recipientId: string;
  reason?: NoAnswerReason;
}): Promise<NoAnswerFallbackResult> {
  const { sessionId, recipientId } = params;
  const reason: NoAnswerReason = params.reason ?? "no_answer";

  // 'failed' = Twilio 자체 오류 (carrier 거부 등). 재시도해도 같은 결과일 가능성이 높고,
  // 부모님 잘못이 아니므로 SMS도 보내지 않는다. 운영 채널 알림은 별도 시스템에서 처리.
  if (reason === "failed") {
    console.warn("[no-answer-fallback] reason=failed → no retry, no sms", { sessionId });
    return { ok: true, action: "skipped_failed_no_retry" };
  }

  // 1) session → job 추적 (parent job 의 retry_count 결정)
  const sess = await supabaseAdmin
    .from("call_sessions")
    .select("id, job_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (sess.error) {
    return { ok: false, action: "skipped", reason: `session_lookup:${sess.error.message}` };
  }

  let parentJobRetry = 0;
  let parentJobId: string | null = null;
  if (sess.data?.job_id) {
    const job = await supabaseAdmin
      .from("outbound_call_jobs")
      .select("id, retry_count, reason, parent_job_id")
      .eq("id", sess.data.job_id)
      .maybeSingle();
    if (!job.error && job.data) {
      // root parent job 추적
      parentJobId = job.data.parent_job_id ?? job.data.id;
      // root 의 retry_count
      if (job.data.parent_job_id) {
        const root = await supabaseAdmin
          .from("outbound_call_jobs")
          .select("retry_count")
          .eq("id", job.data.parent_job_id)
          .maybeSingle();
        parentJobRetry = root.data?.retry_count ?? 0;
      } else {
        parentJobRetry = job.data.retry_count ?? 0;
      }
    }
  }

  // 2) retry_count < 1 → 30분 뒤 retry job 생성 (멱등 체크)
  if (parentJobRetry < 1 && parentJobId) {
    // 이미 같은 parent_job_id 의 retry job이 있으면 skip
    const existingRetry = await supabaseAdmin
      .from("outbound_call_jobs")
      .select("id")
      .eq("parent_job_id", parentJobId)
      .eq("reason", "retry")
      .limit(1);
    if (existingRetry.data && existingRetry.data.length > 0) {
      return { ok: true, action: "retry_already_scheduled", jobId: existingRetry.data[0].id };
    }

    const delayMin = RETRY_DELAY_MIN[reason] || 30;
    const scheduledAt = new Date(Date.now() + delayMin * 60 * 1000);
    const windowEnd = new Date(scheduledAt.getTime() + 30 * 60 * 1000);
    const newJob = await supabaseAdmin
      .from("outbound_call_jobs")
      .insert({
        care_recipient_id: recipientId,
        scheduled_at: scheduledAt.toISOString(),
        window_start: scheduledAt.toISOString(),
        window_end: windowEnd.toISOString(),
        status: "queued",
        reason: "retry",
        parent_job_id: parentJobId,
        retry_count: 0,
      } as never)
      .select("id")
      .single();
    if (newJob.error || !newJob.data) {
      return { ok: false, action: "skipped", reason: newJob.error?.message ?? "retry_insert_failed" };
    }
    // parent job 의 retry_count 증분
    await supabaseAdmin
      .from("outbound_call_jobs")
      .update({ retry_count: parentJobRetry + 1 } as never)
      .eq("id", parentJobId);

    return { ok: true, action: "retry_scheduled", jobId: newJob.data.id };
  }

  // 3) SMS fallback enqueue (부모님)
  // 멱등: 같은 session_id 의 parent_call_fallback 이 이미 있으면 skip
  const existingSms = await supabaseAdmin
    .from("notification_outbox")
    .select("id, status")
    .eq("template_code", PARENT_FALLBACK_TEMPLATE)
    .contains("payload", { session_id: sessionId } as never)
    .limit(1);
  if (existingSms.data && existingSms.data.length > 0) {
    return { ok: true, action: "sms_already_enqueued", outboxId: existingSms.data[0].id };
  }

  // 부모님 phone 조회
  const recip = await supabaseAdmin
    .from("care_recipients")
    .select("phone_e164")
    .eq("id", recipientId)
    .maybeSingle();
  if (recip.error || !recip.data) {
    return { ok: false, action: "skipped", reason: "recipient_not_found" };
  }
  if (!isValidE164(recip.data.phone_e164)) {
    return { ok: true, action: "no_phone", reason: "invalid_or_missing_phone" };
  }

  // 부모님은 SMS를 못 보실 수 있음 — 보조 수단일 뿐.
  const enq = await enqueueSms({
    recipient: recip.data.phone_e164,
    body: PARENT_FALLBACK_BODY,
    templateCode: PARENT_FALLBACK_TEMPLATE,
    alertId: null,
    metadata: {
      kind: "parent_call_fallback",
      session_id: sessionId,
      recipient_id: recipientId,
    },
  });
  if (!enq.ok) {
    return { ok: false, action: "skipped", reason: enq.error };
  }
  return { ok: true, action: "sms_enqueued", outboxId: enq.outboxId };
}
