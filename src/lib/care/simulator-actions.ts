/**
 * Care Simulator
 *
 * 실통화 없이 "가짜 turn → state-machine → extraction → rule-engine → outbox"
 * 전체 흐름을 한 번에 돌려, 새 도메인 코드가 end-to-end 로 동작하는지 확인한다.
 *
 * 보안:
 *  - 인증 필수 (보호자 본인의 family 에 한정).
 *  - 알림은 family_members 의 phone/email 로 enqueue 되지만, 어댑터(adapters.ts)는
 *    아직 콘솔 stub 이므로 실제 카카오/SMS 발송은 일어나지 않는다.
 *
 * 한계 (의도된):
 *  - call_sessions 는 'completed' 로 즉시 마감 — 실제 lifecycle 없음.
 *  - openai_session_id, twilio_call_sid 는 'sim-...' prefix 사용.
 *  - 녹음 없음.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createCtx, decideNext, openingPrompt } from "../../server/care/state-machine";
import type { ClassifiedValue, QuestionId, CallTurn } from "../../server/care/types";
import { extractFromSession } from "../../server/care/extraction";
import { evaluateAll, type RuleFetchers } from "../../server/care/rule-engine";
import { enqueueAllAlerts } from "../../server/notifications/outbox.server";

// ─────────────────────────────────────────────────────────────────────────────
// 시나리오 카탈로그
// ─────────────────────────────────────────────────────────────────────────────

export type ScenarioId =
  | "happy_path"
  | "meal_skipped"
  | "med_missed"
  | "fall_mentioned"
  | "depression"
  | "wrong_person"
  | "no_answer";

interface SimulatedTurn {
  question_id: QuestionId;
  raw_text: string;
  classified: ClassifiedValue | null;
}

const SCENARIOS: Record<ScenarioId, { label: string; turns: SimulatedTurn[]; force_no_answer?: boolean; force_wrong_person?: boolean }> = {
  happy_path: {
    label: "정상 — 모두 정상 응답",
    turns: [
      { question_id: "Q0_IDENTITY", raw_text: "네 맞아요", classified: { axis: "greeting", value: "good" } },
      { question_id: "Q1_MOOD", raw_text: "괜찮아요", classified: { axis: "mood", value: "good" } },
      { question_id: "Q2_MEAL", raw_text: "먹었어요", classified: { axis: "meal", value: "ate" } },
      { question_id: "Q3_MEDICATION", raw_text: "챙겨 먹었어", classified: { axis: "medication", value: "taken" } },
      { question_id: "Q4_SYMPTOM", raw_text: "괜찮아", classified: { axis: "symptom", value: "none" } },
      { question_id: "Q5_SLEEP", raw_text: "잘 잤어", classified: { axis: "sleep", value: "good" } },
      { question_id: "Q6_HELP", raw_text: "없어", classified: { axis: "help", value: "none" } },
    ],
  },
  meal_skipped: {
    label: "식사 결식 (R002 누적 후보)",
    turns: [
      { question_id: "Q0_IDENTITY", raw_text: "네 맞아", classified: { axis: "greeting", value: "good" } },
      { question_id: "Q2_MEAL", raw_text: "오늘은 안 먹었어", classified: { axis: "meal", value: "skipped" } },
      { question_id: "Q2A_MEAL_REASON", raw_text: "입맛이 없어", classified: { axis: "meal", value: "skipped", reason: "no_appetite" } },
    ],
  },
  med_missed: {
    label: "약 미복용",
    turns: [
      { question_id: "Q0_IDENTITY", raw_text: "네", classified: { axis: "greeting", value: "good" } },
      { question_id: "Q3_MEDICATION", raw_text: "깜빡했어", classified: { axis: "medication", value: "missed", reason: "forgot" } },
    ],
  },
  fall_mentioned: {
    label: "낙상 (R004 즉시 critical)",
    turns: [
      { question_id: "Q0_IDENTITY", raw_text: "네 맞아", classified: { axis: "greeting", value: "good" } },
      {
        question_id: "Q4_SYMPTOM",
        raw_text: "어제 화장실에서 넘어졌어",
        classified: { axis: "symptom", value: "severe", detail: "어제 화장실에서 넘어졌어" },
      },
    ],
  },
  depression: {
    label: "우울 표현 (단발 — R006은 누적 필요)",
    turns: [
      { question_id: "Q0_IDENTITY", raw_text: "응", classified: { axis: "greeting", value: "good" } },
      { question_id: "Q1_MOOD", raw_text: "그냥 외로워", classified: { axis: "mood", value: "bad" } },
    ],
  },
  wrong_person: {
    label: "본인 아님 (R008 warning)",
    turns: [],
    force_wrong_person: true,
  },
  no_answer: {
    label: "응답 없음 (R001 누적 후보)",
    turns: [],
    force_no_answer: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Server function
// ─────────────────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  recipient_id: z.string().uuid(),
  scenario: z.enum([
    "happy_path",
    "meal_skipped",
    "med_missed",
    "fall_mentioned",
    "depression",
    "wrong_person",
    "no_answer",
  ]),
});

export interface SimulationResult {
  session_id: string;
  scenario: ScenarioId;
  ai_opening: string;
  turns: { role: "ai" | "user"; text: string; question_id: QuestionId | null }[];
  extracted_count: number;
  fired_rules: { code: string; severity: string; message: string }[];
  enqueued_alerts: { alert_id: string; enqueued: number; skipped_reason?: string }[];
}

export const runSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }): Promise<SimulationResult> => {
    const { supabase } = context;
    const scenario = SCENARIOS[data.scenario];
    const today = new Date().toISOString().slice(0, 10);

    // 1) 권한 확인 (RLS 통한 read)
    const r = await supabase
      .from("care_recipients")
      .select("id, display_name")
      .eq("id", data.recipient_id)
      .maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) throw new Error("recipient not found or access denied");
    const recipientName = r.data.display_name;

    // 2) 가짜 call_sessions row (admin 으로 작성 — sim 메타 보존)
    const sessionStatus = scenario.force_no_answer
      ? "no_answer"
      : "completed";
    const sessionIns = await supabaseAdmin
      .from("call_sessions")
      .insert({
        care_recipient_id: data.recipient_id,
        twilio_call_sid: `sim-${Date.now()}`,
        openai_session_id: `sim-${data.scenario}`,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        status: sessionStatus,
        end_reason: scenario.force_wrong_person
          ? "wrong_person"
          : scenario.force_no_answer
            ? "silence_timeout"
            : "normal",
        wrong_person_flag: !!scenario.force_wrong_person,
        duration_sec: scenario.force_no_answer ? 0 : Math.max(15, scenario.turns.length * 8),
      })
      .select("id")
      .single();
    if (sessionIns.error) throw sessionIns.error;
    const sessionId = sessionIns.data.id as string;

    // 3) state-machine 시뮬레이션
    const ctx = createCtx();
    const ai_opening = openingPrompt(recipientName);
    const turnsForUI: SimulationResult["turns"] = [];
    const turnsToInsert: Omit<CallTurn, "id" | "created_at">[] = [];

    if (!scenario.force_no_answer && !scenario.force_wrong_person) {
      // AI opening
      turnsForUI.push({ role: "ai", text: ai_opening, question_id: "Q0_IDENTITY" });
      turnsToInsert.push({
        session_id: sessionId,
        turn_index: 0,
        role: "ai",
        question_id: "Q0_IDENTITY",
        raw_text: ai_opening,
        is_unclear: false,
      });

      let idx = 1;
      let current: QuestionId = "Q0_IDENTITY";
      for (const t of scenario.turns) {
        // user turn
        turnsForUI.push({ role: "user", text: t.raw_text, question_id: t.question_id });
        turnsToInsert.push({
          session_id: sessionId,
          turn_index: idx++,
          role: "user",
          question_id: t.question_id,
          raw_text: t.raw_text,
          classified_value: t.classified ?? null,
          is_unclear: false,
        });

        // ai 다음 발화
        const decision = decideNext(t.question_id, t.classified, ctx);
        if (decision.prompt) {
          turnsForUI.push({
            role: "ai",
            text: decision.prompt,
            question_id: decision.next_question_id ?? null,
          });
          turnsToInsert.push({
            session_id: sessionId,
            turn_index: idx++,
            role: "ai",
            question_id: decision.next_question_id ?? null,
            raw_text: decision.prompt,
            is_unclear: false,
          });
        }
        if (decision.end) break;
        current = decision.next_question_id ?? current;
      }
    }

    if (turnsToInsert.length > 0) {
      const ti = await supabaseAdmin.from("call_turns").insert(turnsToInsert as never);
      if (ti.error) throw ti.error;
    }

    // 4) extraction (실 DB I/O)
    if (turnsToInsert.length > 0) {
      await extractFromSession(
        sessionId,
        {
          getTurns: async () => {
            const q = await supabaseAdmin
              .from("call_turns")
              .select("*")
              .eq("session_id", sessionId)
              .order("turn_index");
            if (q.error) throw q.error;
            return (q.data ?? []) as unknown as CallTurn[];
          },
          getSessionMeta: async () => ({
            care_recipient_id: data.recipient_id,
            recorded_for_date: today,
          }),
        },
        {
          upsertExtracted: async (rows) => {
            if (rows.length === 0) return;
            const ins = await supabaseAdmin.from("extracted_check_results").insert(rows as never);
            if (ins.error) throw ins.error;
          },
          insertSymptoms: async (rows) => {
            if (rows.length === 0) return;
            const ins = await supabaseAdmin.from("symptoms_log").insert(rows as never);
            if (ins.error) throw ins.error;
          },
        },
      );
    }

    // 5) rule-engine 평가 (실 DB fetcher)
    const fetchers: RuleFetchers = {
      recentCallSessions: async (rid, hours) => {
        const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
        const q = await supabaseAdmin
          .from("call_sessions")
          .select("*")
          .eq("care_recipient_id", rid)
          .gte("created_at", since);
        if (q.error) throw q.error;
        return (q.data ?? []) as never;
      },
      recentExtracted: async (rid, axis, days) => {
        const since = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 10);
        const q = await supabaseAdmin
          .from("extracted_check_results")
          .select("*")
          .eq("care_recipient_id", rid)
          .eq("axis", axis)
          .gte("recorded_for_date", since);
        if (q.error) throw q.error;
        return (q.data ?? []) as never;
      },
      recentMedAdherence: async (rid, days) => {
        const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
        const q = await supabaseAdmin
          .from("medication_adherence_logs")
          .select("ml.*")
          .gte("expected_at", since);
        if (q.error) return [];
        return (q.data ?? []) as never;
      },
      todaysKeywordCategories: async (rid) => {
        const q = await supabaseAdmin
          .from("symptoms_log")
          .select("category")
          .eq("care_recipient_id", rid)
          .eq("occurred_on", today);
        if (q.error) throw q.error;
        return (q.data ?? []).map((r) => (r as { category: string }).category);
      },
      hasWrongPersonToday: async (rid) => {
        const q = await supabaseAdmin
          .from("call_sessions")
          .select("id")
          .eq("care_recipient_id", rid)
          .eq("wrong_person_flag", true)
          .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
          .limit(1);
        if (q.error) throw q.error;
        return (q.data ?? []).length > 0;
      },
      hadSideEffectAnswerToday: async (rid) => {
        const q = await supabaseAdmin
          .from("extracted_check_results")
          .select("value")
          .eq("care_recipient_id", rid)
          .eq("axis", "medication")
          .gte("recorded_for_date", today);
        if (q.error) return false;
        return (q.data ?? []).some((r) => {
          const v = (r as { value: { reason?: string } }).value;
          return v?.reason === "side_effect";
        });
      },
    };

    const fired = await evaluateAll({ recipientId: data.recipient_id, fetchers });

    // 6) outbox enqueue
    const enq = await enqueueAllAlerts(data.recipient_id, fired);

    return {
      session_id: sessionId,
      scenario: data.scenario,
      ai_opening,
      turns: turnsForUI,
      extracted_count: turnsToInsert.filter((t) => t.role === "user" && t.classified_value).length,
      fired_rules: fired.map((f) => ({
        code: f.rule_code,
        severity: f.severity,
        message: f.guardian_message,
      })),
      enqueued_alerts: enq.map((e) => ({
        alert_id: e.alert_id,
        enqueued: e.enqueued,
        skipped_reason: e.skipped_reason,
      })),
    };
  });

export const listScenarios = createServerFn({ method: "GET" }).handler(async () => {
  return Object.entries(SCENARIOS).map(([id, s]) => ({ id: id as ScenarioId, label: s.label }));
});
