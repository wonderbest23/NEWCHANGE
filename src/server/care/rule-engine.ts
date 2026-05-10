/**
 * Rule Engine
 *
 * 결정주의 규칙. LLM 미사용. 입력은 모두 구조화된 데이터.
 *
 * 사용:
 *   const fired = await evaluateAll({ recipientId, fetchers });
 *
 * 새 규칙 추가:
 *   1. RULES 배열에 push
 *   2. anomaly_rules 테이블에도 같은 code 시드 (docs/schema/003_seed_rules.sql)
 *   3. 알림 템플릿 docs/policy/08-kakao-templates.md
 */

import type {
  AnomalyAlert,
  CallSession,
  ExtractedCheckResult,
  MedicationAdherenceLog,
  Severity,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Fetcher 인터페이스 (DB 어댑터를 주입)
// ─────────────────────────────────────────────────────────────────────────────

export interface RuleFetchers {
  recentCallSessions(recipientId: string, hours: number): Promise<CallSession[]>;
  recentExtracted(
    recipientId: string,
    axis: ExtractedCheckResult["axis"],
    days: number,
  ): Promise<ExtractedCheckResult[]>;
  recentMedAdherence(recipientId: string, days: number): Promise<MedicationAdherenceLog[]>;
  /** 오늘 통화 turns 의 매칭된 키워드 카테고리들 */
  todaysKeywordCategories(recipientId: string): Promise<string[]>;
  /** 오늘 통화의 wrong_person_flag 여부 */
  hasWrongPersonToday(recipientId: string): Promise<boolean>;
  /** Q3A side_effect 응답이 오늘 있었는지 */
  hadSideEffectAnswerToday(recipientId: string): Promise<boolean>;
}

export interface RuleContext {
  recipientId: string;
  fetchers: RuleFetchers;
  now: Date;
}

export interface RuleResult {
  rule_code: string;
  severity: Severity;
  guardian_message: string;
  evidence: Record<string, unknown>;
}

interface Rule {
  code: string;
  severity: Severity;
  evaluate(ctx: RuleContext): Promise<RuleResult | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule definitions
// ─────────────────────────────────────────────────────────────────────────────

const R001_NoResponse48h: Rule = {
  code: "R001",
  severity: "critical",
  async evaluate(ctx) {
    const sessions = await ctx.fetchers.recentCallSessions(ctx.recipientId, 48);
    const noAnswer = sessions.filter((s) => s.status === "no_answer").length;
    const success = sessions.filter((s) => s.status === "completed").length;
    if (success === 0 && noAnswer >= 3) {
      return {
        rule_code: "R001",
        severity: "critical",
        guardian_message: "지난 48시간 동안 안부 통화에 응답이 없어요.",
        evidence: { window_hours: 48, no_answer: noAnswer, success: 0 },
      };
    }
    return null;
  },
};

const R002_MealSkipped2d: Rule = {
  code: "R002",
  severity: "warning",
  async evaluate(ctx) {
    const meals = await ctx.fetchers.recentExtracted(ctx.recipientId, "meal", 2);
    const skippedDates = new Set(
      meals
        .filter((r) => r.value.axis === "meal" && r.value.value === "skipped")
        .map((r) => r.recorded_for_date),
    );
    if (skippedDates.size >= 2) {
      return {
        rule_code: "R002",
        severity: "warning",
        guardian_message: "이틀 연속 식사를 못 하셨다고 하셨어요.",
        evidence: { dates: [...skippedDates] },
      };
    }
    return null;
  },
};

const R003_MedMissedRepeat: Rule = {
  code: "R003",
  severity: "warning",
  async evaluate(ctx) {
    const logs = await ctx.fetchers.recentMedAdherence(ctx.recipientId, 7);
    const missed = logs.filter((l) => l.status === "missed").length;
    if (missed >= 3) {
      return {
        rule_code: "R003",
        severity: "warning",
        guardian_message: `최근 7일 중 ${missed}회 약 복용을 놓치셨어요.`,
        evidence: { window_days: 7, missed_count: missed },
      };
    }
    return null;
  },
};

const R004_FallMentioned: Rule = {
  code: "R004",
  severity: "critical",
  async evaluate(ctx) {
    const cats = await ctx.fetchers.todaysKeywordCategories(ctx.recipientId);
    if (cats.includes("fall")) {
      return {
        rule_code: "R004",
        severity: "critical",
        guardian_message: "오늘 통화 중 낙상 관련 말씀이 있었어요.",
        evidence: { categories: cats.filter((c) => c === "fall") },
      };
    }
    return null;
  },
};

const R005_VitalEmergency: Rule = {
  code: "R005",
  severity: "critical",
  async evaluate(ctx) {
    const cats = await ctx.fetchers.todaysKeywordCategories(ctx.recipientId);
    const emergency = cats.filter((c) =>
      ["chest_pain", "breathing", "stroke", "consciousness", "bleeding", "self_harm"].includes(c),
    );
    if (emergency.length > 0) {
      return {
        rule_code: "R005",
        severity: "critical",
        guardian_message: "통화 중 응급 증상을 호소하셨어요. 지금 바로 확인이 필요합니다.",
        evidence: { categories: emergency },
      };
    }
    return null;
  },
};

const R006_DepressionRepeat: Rule = {
  code: "R006",
  severity: "warning",
  async evaluate(ctx) {
    const moods = await ctx.fetchers.recentExtracted(ctx.recipientId, "mood", 14);
    const badDays = new Set(
      moods.filter((r) => r.value.axis === "mood" && r.value.value === "bad").map((r) => r.recorded_for_date),
    );
    if (badDays.size >= 5) {
      return {
        rule_code: "R006",
        severity: "warning",
        guardian_message: "최근 2주간 기분이 가라앉으신 표현이 잦았어요.",
        evidence: { bad_days: [...badDays] },
      };
    }
    return null;
  },
};

const R007_SleepBad: Rule = {
  code: "R007",
  severity: "info",
  async evaluate(ctx) {
    const sleeps = await ctx.fetchers.recentExtracted(ctx.recipientId, "sleep", 7);
    const poor = new Set(
      sleeps.filter((r) => r.value.axis === "sleep" && r.value.value === "poor").map((r) => r.recorded_for_date),
    );
    if (poor.size >= 5) {
      return {
        rule_code: "R007",
        severity: "info",
        guardian_message: "최근 일주일 수면이 좋지 않으셨어요.",
        evidence: { poor_days: [...poor] },
      };
    }
    return null;
  },
};

const R008_WrongPerson: Rule = {
  code: "R008",
  severity: "warning",
  async evaluate(ctx) {
    if (await ctx.fetchers.hasWrongPersonToday(ctx.recipientId)) {
      return {
        rule_code: "R008",
        severity: "warning",
        guardian_message: "어르신이 아닌 분이 통화를 받으셨어요. 번호 확인이 필요해요.",
        evidence: {},
      };
    }
    return null;
  },
};

const R009_SideEffect: Rule = {
  code: "R009",
  severity: "warning",
  async evaluate(ctx) {
    if (await ctx.fetchers.hadSideEffectAnswerToday(ctx.recipientId)) {
      return {
        rule_code: "R009",
        severity: "warning",
        guardian_message: "약 부작용 가능성을 말씀하셨어요. 의료진 판단이 필요합니다.",
        evidence: {},
      };
    }
    return null;
  },
};

export const RULES: Rule[] = [
  R001_NoResponse48h,
  R002_MealSkipped2d,
  R003_MedMissedRepeat,
  R004_FallMentioned,
  R005_VitalEmergency,
  R006_DepressionRepeat,
  R007_SleepBad,
  R008_WrongPerson,
  R009_SideEffect,
];

export async function evaluateAll(ctx: Omit<RuleContext, "now"> & { now?: Date }): Promise<RuleResult[]> {
  const full: RuleContext = { ...ctx, now: ctx.now ?? new Date() };
  const out: RuleResult[] = [];
  for (const r of RULES) {
    try {
      const result = await r.evaluate(full);
      if (result) out.push(result);
    } catch (e) {
      console.error(`[rule:${r.code}] evaluation failed`, e);
    }
  }
  return out;
}

/** RuleResult → AnomalyAlert(insert payload) */
export function toAlertInsert(
  recipientId: string,
  result: RuleResult,
): Omit<AnomalyAlert, "id" | "created_at" | "status" | "acknowledged_by" | "acknowledged_at" | "resolved_at"> & {
  status: "open";
} {
  return {
    rule_code: result.rule_code,
    care_recipient_id: recipientId,
    severity: result.severity,
    evidence: result.evidence,
    guardian_message: result.guardian_message,
    status: "open",
  };
}
