/**
 * Twilio Inbound SMS webhook.
 *
 * POST /api/public/sms/inbound
 *
 * 흐름:
 *   1) X-Twilio-Signature 검증 (TWILIO_AUTH_TOKEN 미설정 시 WARN-only)
 *   2) From 번호 → care_recipients.phone_e164 매칭
 *   3) Body 숫자 응답 파싱:
 *        "1" → ok            (status 양호)
 *        "2" → meal_unknown  (식사 못 함)
 *        "3" → symptom_other (몸 불편)
 *        "4" → help_needed   (전화 필요)
 *        그 외 → unknown (raw_text 만 저장)
 *   4) extracted_check_results 에 axis='sms_reply' insert
 *   5) help_needed 인 경우 daily_log 에는 저장하지 않음 (axis schema 보호)
 *   6) runRulesForRecipient 호출
 *
 * 멱등성:
 *   - Twilio 가 같은 메시지를 재전송해도 같은 MessageSid 가 옴.
 *   - 같은 (session_id?, raw_text, recipient_id, recorded_for_date) 4-tuple 중복 방지를
 *     extracted_check_results 의 unique 제약(session_id+axis)에 의지하지만, sms_reply 는
 *     session_id 가 null 일 수 있어 MessageSid 를 evidence 에 저장하고 사전 조회로 dedupe.
 *
 * 응답: TwiML <Response/> (Twilio 가 재시도하지 않도록 항상 200)
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildFullUrlFromRequest,
  verifyTwilioPostSignature,
} from "@/server/twilio/verify.server";
import { runRulesForRecipient } from "@/server/care/rule-engine.server";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

type ReducedStatus = "ok" | "meal_unknown" | "symptom_other" | "help_needed" | "unknown";

function parseBody(raw: string): ReducedStatus {
  const trimmed = raw.trim();
  if (trimmed === "1") return "ok";
  if (trimmed === "2") return "meal_unknown";
  if (trimmed === "3") return "symptom_other";
  if (trimmed === "4") return "help_needed";
  return "unknown";
}

export const Route = createFileRoute("/api/public/sms/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const text = await request.text();
        const form = new URLSearchParams(text);
        const params: Record<string, string> = {};
        form.forEach((v, k) => (params[k] = v));

        const verify = verifyTwilioPostSignature(
          request.headers.get("x-twilio-signature"),
          buildFullUrlFromRequest(request),
          params,
          process.env.TWILIO_AUTH_TOKEN,
        );
        if (!verify.ok) {
          console.warn("[sms:inbound] signature reject:", verify.reason);
          return new Response("Unauthorized", { status: 401 });
        }

        const fromNumber = params["From"];
        const body = params["Body"] ?? "";
        const messageSid = params["MessageSid"] ?? params["SmsMessageSid"] ?? null;

        if (!fromNumber) {
          return new Response(EMPTY_TWIML, {
            status: 200,
            headers: { "Content-Type": "text/xml" },
          });
        }

        // recipient match
        const recip = await supabaseAdmin
          .from("care_recipients")
          .select("id")
          .eq("phone_e164", fromNumber)
          .maybeSingle();

        if (recip.error) {
          console.error("[sms:inbound] recipient lookup failed", recip.error);
          // 200으로 응답해 Twilio 재시도 폭주 방지
          return new Response(EMPTY_TWIML, {
            status: 200,
            headers: { "Content-Type": "text/xml" },
          });
        }
        if (!recip.data) {
          console.warn("[sms:inbound] no matching recipient for", fromNumber);
          return new Response(EMPTY_TWIML, {
            status: 200,
            headers: { "Content-Type": "text/xml" },
          });
        }

        const recipientId = recip.data.id;
        const reduced = parseBody(body);
        const today = new Date().toISOString().slice(0, 10);

        // dedupe by message_sid (있을 때)
        if (messageSid) {
          const dup = await supabaseAdmin
            .from("extracted_check_results")
            .select("id")
            .eq("care_recipient_id", recipientId)
            .eq("axis", "sms_reply")
            .contains("value", { message_sid: messageSid } as never)
            .limit(1);
          if (dup.data && dup.data.length > 0) {
            return new Response(EMPTY_TWIML, {
              status: 200,
              headers: { "Content-Type": "text/xml" },
            });
          }
        }

        // 가장 최근 sms_fallback outbox 기록과 연결 (있으면 session_id 유추)
        let linkedSessionId: string | null = null;
        const recentFb = await supabaseAdmin
          .from("notification_outbox")
          .select("payload, sent_at, created_at")
          .eq("template_code", "parent_call_fallback_v1")
          .eq("recipient", fromNumber)
          .order("created_at", { ascending: false })
          .limit(1);
        if (recentFb.data && recentFb.data.length > 0) {
          const p = (recentFb.data[0].payload ?? {}) as Record<string, unknown>;
          if (typeof p["session_id"] === "string") {
            linkedSessionId = p["session_id"] as string;
          }
        }

        const value = {
          source: "sms_reply_v1",
          reduced_status: reduced,
          raw_text: body,
          message_sid: messageSid,
          linked_session_id: linkedSessionId,
        };

        // sms_reply 는 session_id 가 null 인 경우가 일반적
        // (insert 후 unique 제약은 session_id+axis 이지만 sms_reply 는 session_id null
        //  여러건 허용. dedupe 는 위 message_sid 사전 조회로 처리.)
        const ins = await supabaseAdmin
          .from("extracted_check_results")
          .insert([
            {
              care_recipient_id: recipientId,
              session_id: linkedSessionId,
              axis: "sms_reply",
              recorded_for_date: today,
              value: value as never,
            } as never,
          ])
          .select("id")
          .maybeSingle();

        if (ins.error) {
          console.error("[sms:inbound] extracted insert failed", ins.error);
        }

        // help_needed → symptoms_log 에 followup 카테고리로 기록 (severity=medium)
        if (reduced === "help_needed" || reduced === "symptom_other") {
          const sev = reduced === "help_needed" ? "medium" : "low";
          await supabaseAdmin
            .from("symptoms_log")
            .insert([
              {
                care_recipient_id: recipientId,
                session_id: linkedSessionId,
                category: reduced === "help_needed" ? "help" : "other",
                severity: sev,
                keywords: [body.slice(0, 40)] as never,
                occurred_on: today,
              } as never,
            ]);
        }

        // 룰 재평가 (실패해도 200)
        try {
          const rr = await runRulesForRecipient(recipientId);
          console.log("[sms:inbound] rules", recipientId, reduced, rr);
        } catch (err) {
          console.error("[sms:inbound] rule engine failed", err);
        }

        return new Response(EMPTY_TWIML, {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        });
      },
    },
  },
});
