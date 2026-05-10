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
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyOpenAIWebhook } from "@/server/openai/verify.server";
import {
  loadCallContext,
  decideAfterAnswer,
  decideAfterUnclear,
} from "@/server/care/call-context.server";
import type { ClassifiedValue, QuestionId, CallEndReason } from "@/server/care/types";

const ToolCallSchema = z.object({
  call_id: z.string().min(1).max(128),
  tool_name: z.enum(["record_answer", "mark_unclear", "escalate_high_risk", "end_call"]),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

async function findSessionByOpenaiCallId(
  callId: string,
): Promise<{ id: string; care_recipient_id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("call_sessions")
    .select("id, care_recipient_id")
    .eq("openai_session_id", callId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function setEndReason(sessionId: string, reason: CallEndReason) {
  const { error } = await supabaseAdmin
    .from("call_sessions")
    .update({ end_reason: reason, updated_at: new Date().toISOString() } as never)
    .eq("id", sessionId);
  if (error) console.error("[openai:tool] end_reason update failed", error);
}

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
        const parsed = ToolCallSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        const { call_id, tool_name, arguments: args } = parsed.data;

        const session = await findSessionByOpenaiCallId(call_id);
        if (!session) {
          console.warn("[openai:tool] session not found for call_id", call_id);
          return Response.json({ error: "session_not_found" }, { status: 404 });
        }

        switch (tool_name) {
          case "record_answer": {
            const questionId = ((args.question_id as string | undefined) ?? "UNKNOWN") as QuestionId;
            const rawText = (args.raw_text as string | undefined) ?? "";
            const classified = (args.classified_value as ClassifiedValue | undefined) ?? null;
            const confidence = typeof args.confidence === "number" ? args.confidence : null;

            // ctx는 INSERT 전에 로드해야 "현재까지의 누적"이 정확함
            const context = await loadCallContext(session.id);
            const idx = context.lastTurnIndex + 1;

            await supabaseAdmin.from("call_turns").insert({
              session_id: session.id,
              turn_index: idx,
              role: "user",
              question_id: questionId,
              raw_text: rawText,
              classified_value: classified as never,
              is_unclear: false,
              confidence,
            } as never);

            const next = decideAfterAnswer(context, questionId, classified);

            // ESCALATE 종착이면 end_reason 기록
            if (next.end && next.next_question_id === "ESCALATE") {
              await setEndReason(session.id, "escalate");
            } else if (next.end && next.next_question_id === null) {
              await setEndReason(session.id, "normal");
            }
            return Response.json(next);
          }

          case "mark_unclear": {
            const questionId = ((args.question_id as string | undefined) ?? "UNKNOWN") as QuestionId;
            const rawText = (args.raw_text as string | undefined) ?? "";

            // INSERT 전에 ctx 로드 → 이번 unclear가 "재질문" 인지 "다음 질문 강제 이동" 인지 판단
            const context = await loadCallContext(session.id);
            const idx = context.lastTurnIndex + 1;

            await supabaseAdmin.from("call_turns").insert({
              session_id: session.id,
              turn_index: idx,
              role: "user",
              question_id: questionId,
              raw_text: rawText,
              is_unclear: true,
            } as never);

            // INSERT 이후의 누적값 기준으로 분기 결정
            // (loadCallContext는 한번 더 부르지 않고 in-memory 카운트 +1 처리)
            context.ctx.unclearCount[questionId] =
              (context.ctx.unclearCount[questionId] ?? 0) + 1;

            const next = decideAfterUnclear(context, questionId);
            return Response.json(next);
          }

          case "escalate_high_risk": {
            const category = (args.category as string | undefined) ?? "unknown";
            const rawText = (args.raw_text as string | undefined) ?? "";

            const context = await loadCallContext(session.id);
            const idx = context.lastTurnIndex + 1;

            await supabaseAdmin.from("call_turns").insert({
              session_id: session.id,
              turn_index: idx,
              role: "user",
              question_id: "ESCALATE",
              raw_text: rawText,
              classified_value: { axis: "escalate", category } as never,
              is_unclear: false,
            } as never);

            await setEndReason(session.id, "escalate");
            return Response.json({ end: true, next_question_id: "ESCALATE" });
          }

          case "end_call": {
            const rawReason = (args.reason as string | undefined) ?? "normal";
            const allowed: CallEndReason[] = [
              "normal",
              "user_ended",
              "silence_timeout",
              "hard_limit",
              "escalate",
              "wrong_person",
              "consent_denied",
            ];
            const finalReason: CallEndReason = (allowed as string[]).includes(rawReason)
              ? (rawReason as CallEndReason)
              : "normal";
            await setEndReason(session.id, finalReason);
            return Response.json({ end: true });
          }
        }
      },
    },
  },
});
