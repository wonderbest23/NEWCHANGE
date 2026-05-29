/**
 * Twilio TwiML endpoint — 발신 시 호출되어 SIP bridge 명령 반환.
 *
 * 처리 (1단계):
 *  1. X-Twilio-Signature 검증 (TWILIO_AUTH_TOKEN 미설정이면 WARN-only 통과)
 *  2. jobId → outbound_call_jobs 조회 (없으면 안전 hangup)
 *  3. CallSid를 query에서 받아 call_sessions row upsert (status='initiated')
 *  4. <Dial><Sip> 응답: OpenAI Realtime SIP로 bridge.
 *     SIP custom header로 X-Session-Id, X-Job-Id 둘 다 주입 (다중 매핑 fallback용)
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildFullUrlFromRequest,
  verifyTwilioGetSignature,
} from "@/server/twilio/verify.server";

function publicBaseUrl(request: Request): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hangupResponse(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say language="ko-KR">${escapeXml(message)}</Say><Hangup/></Response>`;
  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/twilio/twiml/$jobId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const verify = verifyTwilioGetSignature(
          request.headers.get("x-twilio-signature"),
          buildFullUrlFromRequest(request),
          process.env.TWILIO_AUTH_TOKEN,
        );
        if (!verify.ok) {
          console.warn("[twilio:twiml] signature reject:", verify.reason);
          return new Response("Unauthorized", { status: 401 });
        }

        const jobId = params.jobId;
        const url = new URL(request.url);
        const callSid = url.searchParams.get("CallSid");

        // 1. job 조회
        const job = await supabaseAdmin
          .from("outbound_call_jobs")
          .select("id, care_recipient_id, status")
          .eq("id", jobId)
          .maybeSingle();

        if (job.error || !job.data) {
          console.warn("[twilio:twiml] job not found", jobId, job.error);
          return hangupResponse("잘못된 호출입니다. 죄송합니다.");
        }
        if (
          job.data.status === "cancelled" ||
          job.data.status === "done" ||
          job.data.status === "failed" ||
          job.data.status === "no_answer"
        ) {
          console.warn("[twilio:twiml] job not eligible", jobId, job.data.status);
          return hangupResponse("죄송합니다. 통화를 진행할 수 없습니다.");
        }

        // 2. call_sessions row 생성 (CallSid 기준 멱등성)
        let sessionId: string | null = null;
        if (callSid) {
          const existing = await supabaseAdmin
            .from("call_sessions")
            .select("id")
            .eq("twilio_call_sid", callSid)
            .maybeSingle();
          if (existing.data) {
            sessionId = existing.data.id;
          } else {
            const inserted = await supabaseAdmin
              .from("call_sessions")
              .insert({
                care_recipient_id: job.data.care_recipient_id,
                job_id: job.data.id,
                twilio_call_sid: callSid,
                status: "initiated",
                started_at: new Date().toISOString(),
              } as never)
              .select("id")
              .single();
            if (inserted.error || !inserted.data) {
              console.error("[twilio:twiml] call_sessions insert failed", inserted.error);
              return hangupResponse("죄송합니다. 잠시 후 다시 시도해주세요.");
            }
            sessionId = inserted.data.id;
          }
        } else {
          // CallSid 없는 비정상 호출 — 매핑 키가 빠진 채로 진행하면 안 되므로 hangup
          console.warn("[twilio:twiml] missing CallSid in query");
          return hangupResponse("죄송합니다. 통화 정보를 확인할 수 없습니다.");
        }

        // outbound_call_jobs.status = 'dialing'
        await supabaseAdmin
          .from("outbound_call_jobs")
          .update({ status: "dialing", updated_at: new Date().toISOString() } as never)
          .eq("id", job.data.id);

        // 3. SIP bridge TwiML
        const projectId = process.env.OPENAI_PROJECT_ID ?? "project";
        const sipUriBase =
          process.env.OPENAI_REALTIME_SIP_URI ??
          `sip:${projectId}@sip.api.openai.com;transport=tls`;
        const base = publicBaseUrl(request);
        const statusCb = `${base}/api/public/twilio/status`;

        // SIP custom header는 ; 구분으로 추가 (Twilio가 INVITE에 그대로 전달).
        // X-Session-Id 1순위, X-Job-Id 2순위 fallback용.
        const sipFull =
          `${sipUriBase}` +
          `;X-Session-Id=${encodeURIComponent(sessionId)}` +
          `;X-Job-Id=${encodeURIComponent(job.data.id)}`;

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true" timeLimit="600" action="${escapeXml(statusCb)}">
    <Sip>${escapeXml(sipFull)}</Sip>
  </Dial>
</Response>`;

        return new Response(xml, {
          status: 200,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      },
    },
  },
});
