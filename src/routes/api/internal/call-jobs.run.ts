/**
 * Internal call-jobs worker.
 *
 * cron(pg_cron) 또는 운영자가 5분마다 호출:
 *   POST /api/internal/call-jobs/run
 *   header: x-internal-secret: ${INTERNAL_CRON_SECRET}
 *
 * 처리:
 *  1. queued 상태 + scheduled_at <= now() 인 outbound_call_jobs 조회 (최대 BATCH개)
 *  2. care_recipient 확인 → phone_e164 / status / do_not_disturb / call_window 체크
 *  3. Twilio Calls API 발신
 *  4. 성공: outbound_call_jobs.status = 'dialing'
 *     실패: outbound_call_jobs.status = 'failed' + reason 보강
 *
 * 안전 장치:
 *  - INTERNAL_CRON_SECRET 미설정 OR 헤더 불일치 → 401
 *  - extraction/rule/SMS는 이번 단계 미구현
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createTwilioCall, getTwilioFromNumber } from "@/server/care/twilio.server";
import { isWithinCallWindow } from "@/server/care/call-jobs.server";

const BATCH_SIZE = 25;

interface JobRow {
  id: string;
  care_recipient_id: string;
  scheduled_at: string;
  window_start: string;
  window_end: string;
  status: string;
  retry_count: number;
  reason: string | null;
}

interface RecipientRow {
  id: string;
  display_name: string;
  phone_e164: string | null;
  status: string;
  do_not_disturb: boolean;
  call_window_start: string;
  call_window_end: string;
  timezone: string;
}

interface ProcessOutcome {
  jobId: string;
  outcome: "dialing" | "failed" | "skipped";
  reason?: string;
  callSid?: string;
}

export const Route = createFileRoute("/api/internal/call-jobs/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.INTERNAL_CRON_SECRET;
        if (!secret) {
          console.warn("[call-jobs:run] INTERNAL_CRON_SECRET 미설정 — reject");
          return new Response("internal secret not configured", { status: 401 });
        }
        const provided = request.headers.get("x-internal-secret");
        if (!provided || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
        const fromNumber = getTwilioFromNumber();

        if (!baseUrl) {
          console.error("[call-jobs:run] PUBLIC_BASE_URL 미설정");
          return Response.json(
            { error: "PUBLIC_BASE_URL not configured" },
            { status: 500 },
          );
        }
        if (!fromNumber) {
          console.error("[call-jobs:run] TWILIO_FROM_NUMBER 미설정");
          return Response.json(
            { error: "TWILIO_FROM_NUMBER not configured" },
            { status: 500 },
          );
        }

        const nowIso = new Date().toISOString();

        // 1. queued + scheduled_at <= now()
        const jobsRes = await supabaseAdmin
          .from("outbound_call_jobs")
          .select(
            "id, care_recipient_id, scheduled_at, window_start, window_end, status, retry_count, reason",
          )
          .eq("status", "queued")
          .lte("scheduled_at", nowIso)
          .order("scheduled_at", { ascending: true })
          .limit(BATCH_SIZE);

        if (jobsRes.error) {
          console.error("[call-jobs:run] jobs query failed", jobsRes.error);
          return Response.json({ error: jobsRes.error.message }, { status: 500 });
        }
        const jobs = (jobsRes.data ?? []) as JobRow[];
        if (jobs.length === 0) {
          return Response.json({ ok: true, processed: 0, results: [] });
        }

        const results: ProcessOutcome[] = [];

        for (const job of jobs) {
          const out = await processJob(job, baseUrl, fromNumber);
          results.push(out);
        }

        const summary = {
          ok: true,
          processed: results.length,
          dialing: results.filter((r) => r.outcome === "dialing").length,
          failed: results.filter((r) => r.outcome === "failed").length,
          skipped: results.filter((r) => r.outcome === "skipped").length,
          results,
        };
        return Response.json(summary);
      },
    },
  },
});

async function processJob(
  job: JobRow,
  baseUrl: string,
  fromNumber: string,
): Promise<ProcessOutcome> {
  // recipient 조회
  const recRes = await supabaseAdmin
    .from("care_recipients")
    .select(
      "id, display_name, phone_e164, status, do_not_disturb, call_window_start, call_window_end, timezone",
    )
    .eq("id", job.care_recipient_id)
    .maybeSingle();

  if (recRes.error || !recRes.data) {
    await failJob(job.id, "recipient_not_found");
    return { jobId: job.id, outcome: "failed", reason: "recipient_not_found" };
  }
  const r = recRes.data as RecipientRow;

  if (r.status !== "active") {
    await failJob(job.id, `recipient_status_${r.status}`);
    return { jobId: job.id, outcome: "failed", reason: `recipient_status_${r.status}` };
  }
  if (!r.phone_e164) {
    await failJob(job.id, "no_phone");
    return { jobId: job.id, outcome: "failed", reason: "no_phone" };
  }
  if (r.do_not_disturb) {
    // skip — 다음 cron 주기에 재평가할 여지를 두지 않고 명시적으로 cancelled 처리
    await updateJob(job.id, { status: "cancelled", reason: appendReason(job.reason, "dnd") });
    return { jobId: job.id, outcome: "skipped", reason: "dnd" };
  }
  if (
    !isWithinCallWindow(
      r.call_window_start,
      r.call_window_end,
      r.timezone || "Asia/Seoul",
    )
  ) {
    // 윈도우 밖 → 이번 라운드 skip (status는 queued 유지, 다음 cron에서 재시도)
    return { jobId: job.id, outcome: "skipped", reason: "out_of_window" };
  }

  // Twilio 발신
  const twimlUrl = `${baseUrl}/api/public/twilio/twiml/${job.id}`;
  const statusCb = `${baseUrl}/api/public/twilio/status`;

  const result = await createTwilioCall({
    to: r.phone_e164,
    from: fromNumber,
    url: twimlUrl,
    statusCallback: statusCb,
    timeoutSec: 25,
  });

  if (!result.ok) {
    const reason = `twilio_${result.errorCode ?? result.httpStatus ?? "err"}`;
    console.error("[call-jobs:run] twilio call failed", job.id, result);
    await failJob(job.id, appendReason(job.reason, reason));
    return { jobId: job.id, outcome: "failed", reason: result.errorMessage ?? reason };
  }

  // 성공: dialing
  await updateJob(job.id, { status: "dialing" });
  return { jobId: job.id, outcome: "dialing", callSid: result.sid };
}

function appendReason(prev: string | null, add: string): string {
  if (!prev) return add;
  if (prev.includes(add)) return prev;
  return `${prev};${add}`;
}

async function failJob(jobId: string, reason: string) {
  await updateJob(jobId, { status: "failed", reason });
}

async function updateJob(jobId: string, patch: { status?: string; reason?: string }) {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) upd.status = patch.status;
  if (patch.reason) upd.reason = patch.reason;
  const { error } = await supabaseAdmin
    .from("outbound_call_jobs")
    .update(upd as never)
    .eq("id", jobId);
  if (error) console.error("[call-jobs:run] job update failed", jobId, error);
}
