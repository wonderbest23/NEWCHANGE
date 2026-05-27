/**
 * Twilio status callback — 통화 lifecycle 이벤트 수신.
 * docs: https://www.twilio.com/docs/voice/api/call-resource#statuscallback
 *
 * 서명 검증 정책:
 *  - TWILIO_AUTH_TOKEN 이 설정된 경우: 표준 HMAC 검증, mismatch/missing 헤더면 401.
 *  - TWILIO_AUTH_TOKEN 이 미설정인 경우 (파일럿/로컬 dev): WARN-only 통과
 *    (verify.server.ts 가 ok:true 반환). 프로덕션 secret 등록 시 자동 강제 검증으로 전환됨.
 *
 * 처리 순서:
 *  1. 서명 검증
 *  2. CallSid → call_sessions row 의 현재 상태 읽기 (idempotency 기반선)
 *  3. status / answered_at / ended_at / duration_sec 갱신 (이미 set 된 timestamp 는 보존)
 *  4. 연결된 outbound_call_jobs 도 done/no_answer/failed 로 종료
 *  5. (terminal 이벤트 1회만) extraction + rule engine 또는 no-answer fallback
 *     - post_processed_at 컬럼을 race-free 게이트로 사용
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildFullUrlFromRequest,
  verifyTwilioPostSignature,
} from "@/server/twilio/verify.server";
import { extractFromSession } from "@/server/care/extraction.server";
import { runRulesForRecipient } from "@/server/care/rule-engine.server";
import { handleNoAnswerFallback, type NoAnswerReason } from "@/server/care/call-jobs.server";

type SessionStatus =
  | "initiated"
  | "ringing"
  | "in_progress"
  | "completed"
  | "no_answer"
  | "busy"
  | "failed";

type JobStatus = "done" | "no_answer" | "failed";

function mapTwilioStatus(s: string | undefined): SessionStatus | null {
  switch (s) {
    case "queued":
    case "initiated":
      return "initiated";
    case "ringing":
      return "ringing";
    case "in-progress":
    case "answered":
      return "in_progress";
    case "completed":
      return "completed";
    case "no-answer":
      return "no_answer";
    case "busy":
      return "busy";
    case "failed":
      return "failed";
    case "canceled":
      return "failed";
    default:
      return null;
  }
}

function mapJobStatus(status: SessionStatus | null): JobStatus | null {
  switch (status) {
    case "completed":
      return "done";
    case "no_answer":
      return "no_answer";
    case "busy":
    case "failed":
      return "failed";
    default:
      return null;
  }
}

async function updateLinkedJob(jobId: string | null | undefined, status: JobStatus, reason?: string) {
  if (!jobId) return;
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (reason) patch.reason = reason;

  const { error } = await supabaseAdmin
    .from("outbound_call_jobs")
    .update(patch as never)
    .eq("id", jobId);
  if (error) console.error("[twilio:status] linked job update failed", jobId, error);
}

export const Route = createFileRoute("/api/public/twilio/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const form = new URLSearchParams(body);
        const params: Record<string, string> = {};
        form.forEach((v, k) => (params[k] = v));

        const verify = verifyTwilioPostSignature(
          request.headers.get("x-twilio-signature"),
          buildFullUrlFromRequest(request),
          params,
          process.env.TWILIO_AUTH_TOKEN,
        );
        if (!verify.ok) {
          console.warn("[twilio:status] signature reject:", verify.reason);
          return new Response("Unauthorized", { status: 401 });
        }

        const callSid = params["CallSid"];
        const status = mapTwilioStatus(params["CallStatus"]);
        const durationStr = params["CallDuration"];

        if (!callSid) {
          return new Response("missing CallSid", { status: 400 });
        }

        // Idempotency: Twilio retries the same event on 5xx — we need to:
        //  - read prior state to avoid overwriting answered_at / ended_at / post_processed_at
        //  - run extraction + rules at most once per session (gated on post_processed_at)
        const prior = await supabaseAdmin
          .from("call_sessions")
          .select(
            "id, job_id, care_recipient_id, answered_at, ended_at, post_processed_at, status",
          )
          .eq("twilio_call_sid", callSid)
          .maybeSingle();

        if (prior.error) {
          console.error("[twilio:status] db read failed", prior.error);
          return new Response("db error", { status: 500 });
        }
        if (!prior.data) {
          // Session row not yet created (TwiML hasn't run). Twilio will retry; ack 200 so it stops.
          console.warn("[twilio:status] session row missing for CallSid", callSid);
          return new Response("ok");
        }

        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (status) update["status"] = status;
        if (status === "in_progress" && !prior.data.answered_at) {
          update["answered_at"] = new Date().toISOString();
        }
        if (
          (status === "completed" ||
            status === "no_answer" ||
            status === "busy" ||
            status === "failed") &&
          !prior.data.ended_at
        ) {
          update["ended_at"] = new Date().toISOString();
        }
        if (durationStr) {
          const n = Number.parseInt(durationStr, 10);
          if (!Number.isNaN(n)) update["duration_sec"] = n;
        }

        const upd = await supabaseAdmin
          .from("call_sessions")
          .update(update as never)
          .eq("id", prior.data.id);

        if (upd.error) {
          console.error("[twilio:status] db update failed", upd.error);
          return new Response("db error", { status: 500 });
        }

        const sessionRow = prior.data;
        const jobStatus = mapJobStatus(status);
        if (jobStatus) {
          await updateLinkedJob(
            sessionRow.job_id,
            jobStatus,
            status === "busy" || status === "failed" ? `twilio_${status}` : undefined,
          );
        }

        // Post-processing (extraction / rules / fallback) runs once per session.
        // post_processed_at is the gate. If it's already set, the prior callback
        // for the same terminal event already executed the chain.
        const isTerminal =
          status === "completed" ||
          status === "no_answer" ||
          status === "busy" ||
          status === "failed";
        const alreadyProcessed = !!sessionRow.post_processed_at;

        if (isTerminal && !alreadyProcessed) {
          // Optimistically claim the gate. If another concurrent webhook lost the race
          // they'll see a non-zero rowcount of 0 on their own attempt and skip.
          const claim = await supabaseAdmin
            .from("call_sessions")
            .update({ post_processed_at: new Date().toISOString() } as never)
            .eq("id", sessionRow.id)
            .is("post_processed_at", null)
            .select("id");

          const wonRace = !claim.error && (claim.data?.length ?? 0) > 0;
          if (wonRace) {
            if (status === "completed") {
              try {
                const result = await extractFromSession(sessionRow.id);
                console.log("[twilio:status] extraction result", sessionRow.id, {
                  axesInserted: result.axesInserted,
                  axesSkipped: result.axesSkipped,
                  symptomsInserted: result.symptomsInserted,
                  dailyLogUpserted: result.dailyLogUpserted,
                });
              } catch (err) {
                console.error("[twilio:status] extraction failed", sessionRow.id, err);
              }
              if (sessionRow.care_recipient_id) {
                try {
                  const ruleRes = await runRulesForRecipient(sessionRow.care_recipient_id);
                  console.log("[twilio:status] rules result", sessionRow.care_recipient_id, ruleRes);
                } catch (err) {
                  console.error("[twilio:status] rule engine failed", sessionRow.care_recipient_id, err);
                }
              }
            } else if (sessionRow.care_recipient_id) {
              try {
                const fb = await handleNoAnswerFallback({
                  sessionId: sessionRow.id,
                  recipientId: sessionRow.care_recipient_id,
                  reason: status as NoAnswerReason,
                });
                console.log("[twilio:status] no-answer fallback", {
                  sessionId: sessionRow.id,
                  status,
                  fb,
                });
              } catch (err) {
                console.error("[twilio:status] no-answer fallback failed", sessionRow.id, err);
              }
            }
          } else {
            console.log("[twilio:status] post-processing already claimed by concurrent webhook", sessionRow.id);
          }
        }

        return new Response("ok");
      },
    },
  },
});
