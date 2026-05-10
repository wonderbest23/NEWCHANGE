/**
 * Twilio status callback — 통화 lifecycle 이벤트 수신.
 * docs: https://www.twilio.com/docs/voice/api/call-resource#statuscallback
 *
 * 처리:
 *  1. X-Twilio-Signature 검증 (TWILIO_AUTH_TOKEN 미설정 시 WARN-only 통과)
 *  2. CallSid 로 call_sessions row 업데이트
 *  3. (이후) status='completed' → extraction queue enqueue (TODO: A6 시뮬레이터 외 실제 워커)
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildFullUrlFromRequest,
  formDataToRecord,
  verifyTwilioPostSignature,
} from "@/server/twilio/verify.server";
import { extractFromSession } from "@/server/care/extraction.server";
import { runRulesForRecipient } from "@/server/care/rule-engine.server";
import { handleNoAnswerFallback } from "@/server/care/call-jobs.server";

type SessionStatus =
  | "initiated"
  | "ringing"
  | "answered"
  | "completed"
  | "no_answer"
  | "busy"
  | "failed"
  | "canceled";

function mapTwilioStatus(s: string | undefined): SessionStatus | null {
  switch (s) {
    case "queued":
    case "initiated":
      return "initiated";
    case "ringing":
      return "ringing";
    case "in-progress":
    case "answered":
      return "answered";
    case "completed":
      return "completed";
    case "no-answer":
      return "no_answer";
    case "busy":
      return "busy";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    default:
      return null;
  }
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

        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (status) update["status"] = status;
        if (status === "answered") update["answered_at"] = new Date().toISOString();
        if (status === "completed") update["ended_at"] = new Date().toISOString();
        if (durationStr) {
          const n = Number.parseInt(durationStr, 10);
          if (!Number.isNaN(n)) update["duration_sec"] = n;
        }

        const upd = await supabaseAdmin
          .from("call_sessions")
          .update(update as never)
          .select("id, care_recipient_id")
          .eq("twilio_call_sid", callSid);

        if (upd.error) {
          console.error("[twilio:status] db update failed", upd.error);
          // Twilio 는 5xx 에 재시도하므로, DB 일시 실패는 5xx 로 응답
          return new Response("db error", { status: 500 });
        }

        // status='completed' 시 extraction → rule engine (실패해도 Twilio 재시도 유발 X)
        if (status === "completed") {
          const sessionRow = upd.data?.[0];
          const sessionId = sessionRow?.id;
          const recipientId = sessionRow?.care_recipient_id;
          if (sessionId) {
            try {
              const result = await extractFromSession(sessionId);
              console.log("[twilio:status] extraction result", sessionId, {
                axesInserted: result.axesInserted,
                axesSkipped: result.axesSkipped,
                symptomsInserted: result.symptomsInserted,
                dailyLogUpserted: result.dailyLogUpserted,
              });
            } catch (err) {
              console.error("[twilio:status] extraction failed", sessionId, err);
            }
          } else {
            console.warn("[twilio:status] completed but no session id found for", callSid);
          }
          if (recipientId) {
            try {
              const ruleRes = await runRulesForRecipient(recipientId);
              console.log("[twilio:status] rules result", recipientId, ruleRes);
            } catch (err) {
              console.error("[twilio:status] rule engine failed", recipientId, err);
            }
          }
        }

        // no-answer / busy / failed → retry job 또는 부모님 SMS fallback
        if (status === "no_answer" || status === "busy" || status === "failed") {
          const sessionRow = upd.data?.[0];
          const sessionId = sessionRow?.id;
          const recipientId = sessionRow?.care_recipient_id;
          if (sessionId && recipientId) {
            try {
              const fb = await handleNoAnswerFallback({ sessionId, recipientId });
              console.log("[twilio:status] no-answer fallback", { sessionId, status, fb });
            } catch (err) {
              console.error("[twilio:status] no-answer fallback failed", sessionId, err);
            }
          }
        }

        return new Response("ok");
      },
    },
  },
});
