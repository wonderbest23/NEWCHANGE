/**
 * Call Context — call_turns 기반으로 대화 상태를 매번 재구성.
 *
 * 원칙: Redis/외부 캐시 없이 DB만 사용.
 *
 * 제공:
 *  - loadCallContext(sessionId)
 *      • answered: question_id별 응답 여부 (true=record_answer 1회 이상)
 *      • unclearCount: question_id별 mark_unclear 누적
 *      • highRiskFired: escalate_high_risk 가 한 번이라도 발화됐는지
 *      • lastTurnIndex: 마지막 turn_index (없으면 -1)
 *      • currentQuestionId: 마지막으로 다룬 question_id (없으면 FIRST_QUESTION)
 *
 *  - decideAfterAnswer(ctx, questionId, classifiedValue) → ToolResponse
 *  - decideAfterUnclear(ctx, questionId) → ToolResponse  (재질문 vs 다음 질문)
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  decideNext,
  FIRST_QUESTION,
  MAX_UNCLEAR_PER_QUESTION,
  getPrompt,
  isTerminal,
  type SmCtx,
} from "./state-machine";
import type {
  ClassifiedValue,
  QuestionId,
  ToolResponse,
} from "./types";

export interface CallContext {
  sessionId: string;
  ctx: SmCtx;
  answered: Set<string>;
  highRiskFired: boolean;
  lastTurnIndex: number;
  currentQuestionId: QuestionId;
}

interface TurnRow {
  turn_index: number;
  question_id: string | null;
  is_unclear: boolean;
}

export async function loadCallContext(sessionId: string): Promise<CallContext> {
  const { data, error } = await supabaseAdmin
    .from("call_turns")
    .select("turn_index, question_id, is_unclear")
    .eq("session_id", sessionId)
    .order("turn_index", { ascending: true });

  const ctx: SmCtx = { unclearCount: {} };
  const answered = new Set<string>();
  let highRiskFired = false;
  let lastTurnIndex = -1;
  let currentQuestionId: QuestionId = FIRST_QUESTION;

  if (error) {
    console.error("[call-context] load failed", error);
    return { sessionId, ctx, answered, highRiskFired, lastTurnIndex, currentQuestionId };
  }

  const rows = (data ?? []) as TurnRow[];
  for (const row of rows) {
    if (row.turn_index > lastTurnIndex) lastTurnIndex = row.turn_index;
    const qid = row.question_id ?? "";
    if (qid === "ESCALATE") {
      highRiskFired = true;
      currentQuestionId = "ESCALATE";
      continue;
    }
    if (!qid) continue;

    if (row.is_unclear) {
      ctx.unclearCount[qid] = (ctx.unclearCount[qid] ?? 0) + 1;
    } else {
      answered.add(qid);
    }
    currentQuestionId = qid as QuestionId;
  }

  return { sessionId, ctx, answered, highRiskFired, lastTurnIndex, currentQuestionId };
}

/**
 * record_answer 후 다음 응답.
 * - 응급 키워드 → ESCALATE (state-machine 위임)
 * - 종착이면 end:true
 */
export function decideAfterAnswer(
  context: CallContext,
  questionId: QuestionId,
  value: ClassifiedValue | null,
): ToolResponse {
  return decideNext(questionId, value, context.ctx);
}

/**
 * mark_unclear 후 다음 응답.
 * - unclearCount(누적) <= MAX_UNCLEAR_PER_QUESTION → 같은 질문 재질문
 * - 초과 → state-machine의 "value=null" 분기로 다음 질문으로 강제 진행
 */
export function decideAfterUnclear(
  context: CallContext,
  questionId: QuestionId,
): ToolResponse {
  const count = context.ctx.unclearCount[questionId] ?? 0;

  if (count <= MAX_UNCLEAR_PER_QUESTION) {
    if (isTerminal(questionId)) {
      return { next_question_id: null, end: true };
    }
    return {
      next_question_id: questionId,
      prompt: `다시 한 번 여쭤볼게요. ${getPrompt(questionId)}`,
    };
  }

  // 초과 → 다음 질문으로 강제 진행
  return decideNext(questionId, null, context.ctx);
}
