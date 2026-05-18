/**
 * OpenAI Realtime tool callback (2단계: ctx 영속화 적용)
 *
 * 처리:
 *  - record_answer  → call_turns insert + loadCallContext + decideAfterAnswer
 *  - mark_unclear   → call_turns insert(is_unclear=true) + decideAfterUnclear
 *                     (DB에 누적된 unclear count 기준; 2회째는 다음 질문으로 강제 진행)
 *  - escalate_high_risk → call_turns insert + call_sessions.end_reason='escalate' + end:true
 *  - end_call       → call_sessions.end_reason 업데이트 + end:true
 *
 * 인증: openai webhook 서명 검증 (없으면 WARN-only).
 * 매핑: body의 call_id 로 call_sessions 조회.
 *
 * NOTE:
 *  - 최종 status (completed/no_answer/failed) 확정은 Twilio status callback이 담당.
 *  - extraction / anomaly_alerts 는 다음 단계.
 */

import { createFileRoute } from "@tanstack/react-router";
import { verifyOpenAIWebhook } from "@/server/openai/verify.server";
import { RealtimeToolCallSchema, handleRealtimeToolCall } from "@/server/care/realtime-tools.server";

export const Route = createFileRoute("/api/public/openai/tool")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        const verify = verifyOpenAIWebhook({
          id: request.headers.get("webhook-id"),
          timestamp: request.headers.get("webhook-timestamp"),
          signatureHeader: request.headers.get("webhook-signature"),
          rawBody,
          secret: process.env.OPENAI_WEBHOOK_SECRET,
        });
        if (!verify.ok) {
          console.warn("[openai:tool] webhook signature reject:", verify.reason);
          return new Response("Unauthorized", { status: 401 });
        }

        let body: unknown;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return Response.json({ error: "invalid json" }, { status: 400 });
        }
        const parsed = RealtimeToolCallSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        const { call_id, tool_name, arguments: args } = parsed.data;

        try {
          const result = await handleRealtimeToolCall({
            callId: call_id,
            toolName: tool_name,
            args,
          });
          return Response.json(result);
        } catch (e) {
          if (e instanceof Error && e.message === "session_not_found") {
            console.warn("[openai:tool] session not found for call_id", call_id);
            return Response.json({ error: "session_not_found" }, { status: 404 });
          }
          console.error("[openai:tool] failed", e);
          return Response.json({ error: "tool_failed" }, { status: 500 });
        }
      },
    },
  },
});
