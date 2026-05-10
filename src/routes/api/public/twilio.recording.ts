/**
 * Twilio recording callback — 녹음 완료 시 호출.
 *
 * 처리:
 *  1. 서명 검증
 *  2. call_sessions.recording_url, recording_expires_at 업데이트
 *  3. (TODO) RecordingUrl 다운로드 → 자체 Storage 업로드
 *      - 정책 확정 필요 (docs/policy/07-data-retention.md):
 *        보관기간(현재 후보 90일), 암호화, 삭제주체.
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildFullUrlFromRequest,
  verifyTwilioPostSignature,
} from "@/server/twilio/verify.server";

const RETENTION_DAYS = Number.parseInt(process.env.RECORDING_RETENTION_DAYS ?? "90", 10);

export const Route = createFileRoute("/api/public/twilio/recording")({
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
          console.warn("[twilio:recording] signature reject:", verify.reason);
          return new Response("Unauthorized", { status: 401 });
        }

        const callSid = params["CallSid"];
        const recordingUrl = params["RecordingUrl"];
        if (!callSid || !recordingUrl) {
          return new Response("missing CallSid or RecordingUrl", { status: 400 });
        }

        const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const upd = await supabaseAdmin
          .from("call_sessions")
          .update({
            recording_url: `${recordingUrl}.mp3`,
            recording_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("twilio_call_sid", callSid);

        if (upd.error) {
          console.error("[twilio:recording] db update failed", upd.error);
          return new Response("db error", { status: 500 });
        }

        // TODO (Track B-7 이후): 녹음 다운로드 → 자체 Storage 이전 (vendor-lock 회피, 보관정책 일관)
        return new Response("ok");
      },
    },
  },
});
