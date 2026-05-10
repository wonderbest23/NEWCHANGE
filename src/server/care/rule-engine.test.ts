import { describe, it, expect } from "vitest";
import { evaluateAll, toAlertInsert, RULES, type RuleFetchers } from "./rule-engine";
import type {
  CallSession,
  ExtractedCheckResult,
  MedicationAdherenceLog,
} from "./types";

const RID = "00000000-0000-0000-0000-000000000001";

function makeFetchers(overrides: Partial<RuleFetchers> = {}): RuleFetchers {
  return {
    recentCallSessions: async () => [],
    recentExtracted: async () => [],
    recentMedAdherence: async () => [],
    todaysKeywordCategories: async () => [],
    hasWrongPersonToday: async () => false,
    hadSideEffectAnswerToday: async () => false,
    ...overrides,
  };
}

const session = (status: CallSession["status"]): CallSession => ({
  id: crypto.randomUUID(),
  care_recipient_id: RID,
  status,
  wrong_person_flag: false,
});

describe("rule-engine / RULES 카탈로그", () => {
  it("R001~R009 9개 등록", () => {
    const codes = RULES.map((r) => r.code).sort();
    expect(codes).toEqual([
      "R001",
      "R002",
      "R003",
      "R004",
      "R005",
      "R006",
      "R007",
      "R008",
      "R009",
    ]);
  });
});

describe("rule-engine / R001 48시간 무응답", () => {
  it("성공 0 + no_answer ≥ 3 → critical alert", async () => {
    const fetchers = makeFetchers({
      recentCallSessions: async () => [
        session("no_answer"),
        session("no_answer"),
        session("no_answer"),
      ],
    });
    const out = await evaluateAll({ recipientId: RID, fetchers });
    const r = out.find((x) => x.rule_code === "R001");
    expect(r).toBeTruthy();
    expect(r!.severity).toBe("critical");
  });

  it("성공 1회라도 있으면 미발동", async () => {
    const fetchers = makeFetchers({
      recentCallSessions: async () => [
        session("no_answer"),
        session("no_answer"),
        session("no_answer"),
        session("completed"),
      ],
    });
    const out = await evaluateAll({ recipientId: RID, fetchers });
    expect(out.find((x) => x.rule_code === "R001")).toBeUndefined();
  });

  it("no_answer 2회만 있으면 미발동", async () => {
    const fetchers = makeFetchers({
      recentCallSessions: async () => [session("no_answer"), session("no_answer")],
    });
    const out = await evaluateAll({ recipientId: RID, fetchers });
    expect(out.find((x) => x.rule_code === "R001")).toBeUndefined();
  });
});

describe("rule-engine / R002 식사 결식 2일", () => {
  const meal = (date: string, value: "ate" | "skipped"): ExtractedCheckResult => ({
    id: crypto.randomUUID(),
    session_id: "s",
    care_recipient_id: RID,
    recorded_for_date: date,
    axis: "meal",
    value: { axis: "meal", value },
  });

  it("서로 다른 2일에 skipped → warning", async () => {
    const fetchers = makeFetchers({
      recentExtracted: async (_, axis) => {
        if (axis !== "meal") return [];
        return [meal("2026-04-29", "skipped"), meal("2026-04-30", "skipped")];
      },
    });
    const out = await evaluateAll({ recipientId: RID, fetchers });
    expect(out.find((x) => x.rule_code === "R002")?.severity).toBe("warning");
  });

  it("같은 날짜 2건 skipped 는 1일로 카운트 → 미발동", async () => {
    const fetchers = makeFetchers({
      recentExtracted: async (_, axis) => {
        if (axis !== "meal") return [];
        return [meal("2026-04-30", "skipped"), meal("2026-04-30", "skipped")];
      },
    });
    const out = await evaluateAll({ recipientId: RID, fetchers });
    expect(out.find((x) => x.rule_code === "R002")).toBeUndefined();
  });
});

describe("rule-engine / R003 약 미복용 누적", () => {
  const log = (status: MedicationAdherenceLog["status"]): MedicationAdherenceLog => ({
    id: crypto.randomUUID(),
    schedule_id: "sch",
    expected_at: new Date().toISOString(),
    status,
    source: "call",
  });

  it("missed 3건 이상 → warning", async () => {
    const fetchers = makeFetchers({
      recentMedAdherence: async () => [log("missed"), log("missed"), log("missed")],
    });
    const out = await evaluateAll({ recipientId: RID, fetchers });
    const r = out.find((x) => x.rule_code === "R003");
    expect(r?.severity).toBe("warning");
    expect((r!.evidence as { missed_count: number }).missed_count).toBe(3);
  });

  it("taken 만 있으면 미발동", async () => {
    const fetchers = makeFetchers({
      recentMedAdherence: async () => [log("taken"), log("taken"), log("taken"), log("taken")],
    });
    const out = await evaluateAll({ recipientId: RID, fetchers });
    expect(out.find((x) => x.rule_code === "R003")).toBeUndefined();
  });
});

describe("rule-engine / R004 R005 키워드 기반", () => {
  it("fall 카테고리 → R004 critical", async () => {
    const fetchers = makeFetchers({
      todaysKeywordCategories: async () => ["fall"],
    });
    const out = await evaluateAll({ recipientId: RID, fetchers });
    expect(out.find((x) => x.rule_code === "R004")?.severity).toBe("critical");
  });

  it("chest_pain → R005 critical", async () => {
    const fetchers = makeFetchers({
      todaysKeywordCategories: async () => ["chest_pain"],
    });
    const out = await evaluateAll({ recipientId: RID, fetchers });
    expect(out.find((x) => x.rule_code === "R005")?.severity).toBe("critical");
  });

  it("depression 만 있으면 R005 미발동 (응급 카테고리 아님)", async () => {
    const fetchers = makeFetchers({
      todaysKeywordCategories: async () => ["depression"],
    });
    const out = await evaluateAll({ recipientId: RID, fetchers });
    expect(out.find((x) => x.rule_code === "R005")).toBeUndefined();
  });
});

describe("rule-engine / R008 R009 단순 플래그", () => {
  it("wrong_person → R008 warning", async () => {
    const fetchers = makeFetchers({ hasWrongPersonToday: async () => true });
    const out = await evaluateAll({ recipientId: RID, fetchers });
    expect(out.find((x) => x.rule_code === "R008")?.severity).toBe("warning");
  });

  it("side_effect → R009 warning", async () => {
    const fetchers = makeFetchers({ hadSideEffectAnswerToday: async () => true });
    const out = await evaluateAll({ recipientId: RID, fetchers });
    expect(out.find((x) => x.rule_code === "R009")?.severity).toBe("warning");
  });
});

describe("rule-engine / 안정성", () => {
  it("규칙 1개가 throw 해도 다른 규칙 평가는 계속됨", async () => {
    const fetchers = makeFetchers({
      todaysKeywordCategories: async () => {
        throw new Error("DB down");
      },
      hasWrongPersonToday: async () => true,
    });
    const out = await evaluateAll({ recipientId: RID, fetchers });
    expect(out.find((x) => x.rule_code === "R008")).toBeTruthy();
  });

  it("아무 fetcher 도 트리거 없으면 결과 없음", async () => {
    const out = await evaluateAll({ recipientId: RID, fetchers: makeFetchers() });
    expect(out).toEqual([]);
  });
});

describe("rule-engine / toAlertInsert", () => {
  it("RuleResult 를 alert insert payload 로 변환", () => {
    const insert = toAlertInsert(RID, {
      rule_code: "R004",
      severity: "critical",
      guardian_message: "낙상",
      evidence: { categories: ["fall"] },
    });
    expect(insert.care_recipient_id).toBe(RID);
    expect(insert.status).toBe("open");
    expect(insert.rule_code).toBe("R004");
  });
});
