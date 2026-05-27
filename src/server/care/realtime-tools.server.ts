import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  loadCallContext,
  decideAfterAnswer,
  decideAfterUnclear,
} from "@/server/care/call-context.server";
import type { ClassifiedValue, QuestionId, CallEndReason, ToolResponse } from "@/server/care/types";

export const RealtimeToolCallSchema = z.object({
  call_id: z.string().min(1).max(128),
  tool_name: z.enum(["record_answer", "mark_unclear", "escalate_high_risk", "end_call"]),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

export type RealtimeToolName = z.infer<typeof RealtimeToolCallSchema>["tool_name"];

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
  const patch: Record<string, unknown> = {
    end_reason: reason,
    updated_at: new Date().toISOString(),
  };
  // wrong_person / escalate 는 call_sessions.status check constraint 에도 매칭되는
  // 별도 상태값이 있다. Twilio 가 'completed' 를 보내기 전에 우리가 명확한 종료 사유를
  // 알고 있으므로 status 도 함께 갱신하여 운영 통계/대시보드 분류가 정확해지게 한다.
  if (reason === "wrong_person") {
    patch.status = "wrong_person";
    patch.wrong_person_flag = true;
  } else if (reason === "escalate") {
    patch.status = "escalated";
  }
  const { error } = await supabaseAdmin
    .from("call_sessions")
    .update(patch as never)
    .eq("id", sessionId);
  if (error) console.error("[realtime:tool] end_reason update failed", error);
}

export async function handleRealtimeToolCall(input: {
  callId: string;
  toolName: RealtimeToolName;
  args: Record<string, unknown>;
}): Promise<ToolResponse> {
  const session = await findSessionByOpenaiCallId(input.callId);
  if (!session) {
    console.warn("[realtime:tool] session not found for call_id", input.callId);
    throw new Error("session_not_found");
  }

  switch (input.toolName) {
    case "record_answer": {
      const questionId = ((input.args.question_id as string | undefined) ?? "UNKNOWN") as QuestionId;
      const rawText = (input.args.raw_text as string | undefined) ?? "";
      const classified = (input.args.classified_value as ClassifiedValue | undefined) ?? null;
      const confidence = typeof input.args.confidence === "number" ? input.args.confidence : null;

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

      if (next.end && next.next_question_id === "ESCALATE") {
        await setEndReason(session.id, "escalate");
      } else if (next.end && next.next_question_id === "END_WRONG") {
        await setEndReason(session.id, "wrong_person");
      } else if (next.end && next.next_question_id === null) {
        await setEndReason(session.id, "normal");
      }
      return next;
    }

    case "mark_unclear": {
      const questionId = ((input.args.question_id as string | undefined) ?? "UNKNOWN") as QuestionId;
      const rawText = (input.args.raw_text as string | undefined) ?? "";

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

      context.ctx.unclearCount[questionId] =
        (context.ctx.unclearCount[questionId] ?? 0) + 1;

      return decideAfterUnclear(context, questionId);
    }

    case "escalate_high_risk": {
      const category = (input.args.category as string | undefined) ?? "unknown";
      const rawText = (input.args.raw_text as string | undefined) ?? "";

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
      return { end: true, next_question_id: "ESCALATE", prompt: "지금 자녀 분께 바로 알려드릴게요. 통화를 마치겠습니다." };
    }

    case "end_call": {
      const rawReason = (input.args.reason as string | undefined) ?? "normal";
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
      return { end: true };
    }
  }
}
