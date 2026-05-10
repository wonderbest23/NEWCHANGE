import { describe, it, expect } from "vitest";
import {
  createCtx,
  decideNext,
  openingPrompt,
  isTerminal,
  endReason,
  FIRST_QUESTION,
  MAX_UNCLEAR_PER_QUESTION,
} from "./state-machine";
import type { ClassifiedValue } from "./types";

describe("state-machine / Q0 본인 확인", () => {
  it("good → Q1_MOOD 진행", () => {
    const ctx = createCtx();
    const v: ClassifiedValue = { axis: "greeting", value: "good" };
    const r = decideNext("Q0_IDENTITY", v, ctx);
    expect(r.next_question_id).toBe("Q1_MOOD");
    expect(r.end).toBeFalsy();
  });

  it("bad (다른 사람) → END_WRONG 종결", () => {
    const ctx = createCtx();
    const v: ClassifiedValue = { axis: "greeting", value: "bad" };
    const r = decideNext("Q0_IDENTITY", v, ctx);
    expect(r.next_question_id).toBe("END_WRONG");
    expect(r.end).toBe(true);
  });
});

describe("state-machine / unclear 재질문", () => {
  it("unclear 1회는 같은 질문 재질문", () => {
    const ctx = createCtx();
    const v: ClassifiedValue = { axis: "mood", value: "unclear" };
    const r = decideNext("Q1_MOOD", v, ctx);
    expect(r.next_question_id).toBe("Q1_MOOD");
    expect(ctx.unclearCount["Q1_MOOD"]).toBe(1);
  });

  it("unclear 2회째는 강제로 다음 질문", () => {
    const ctx = createCtx();
    const v: ClassifiedValue = { axis: "mood", value: "unclear" };
    decideNext("Q1_MOOD", v, ctx); // 1회
    const r = decideNext("Q1_MOOD", v, ctx); // 2회
    expect(ctx.unclearCount["Q1_MOOD"]).toBe(MAX_UNCLEAR_PER_QUESTION + 1);
    expect(r.next_question_id).toBe("Q2_MEAL");
  });

  it("null value 도 unclear 로 처리", () => {
    const ctx = createCtx();
    const r = decideNext("Q1_MOOD", null, ctx);
    expect(r.next_question_id).toBe("Q1_MOOD");
  });
});

describe("state-machine / 분기", () => {
  it("Q2 식사 skipped → Q2A_MEAL_REASON 분기", () => {
    const ctx = createCtx();
    const v: ClassifiedValue = { axis: "meal", value: "skipped" };
    const r = decideNext("Q2_MEAL", v, ctx);
    expect(r.next_question_id).toBe("Q2A_MEAL_REASON");
  });

  it("Q3 약 missed → Q3A_MED_REASON 분기", () => {
    const ctx = createCtx();
    const v: ClassifiedValue = { axis: "medication", value: "missed" };
    const r = decideNext("Q3_MEDICATION", v, ctx);
    expect(r.next_question_id).toBe("Q3A_MED_REASON");
  });

  it("Q4 증상 severe → Q4A_SYMPTOM_DETAIL 분기", () => {
    const ctx = createCtx();
    const v: ClassifiedValue = { axis: "symptom", value: "severe" };
    const r = decideNext("Q4_SYMPTOM", v, ctx);
    expect(r.next_question_id).toBe("Q4A_SYMPTOM_DETAIL");
  });

  it("Q6 도움 has_request → Q6A_HELP_DETAIL", () => {
    const ctx = createCtx();
    const v: ClassifiedValue = { axis: "help", value: "has_request" };
    const r = decideNext("Q6_HELP", v, ctx);
    expect(r.next_question_id).toBe("Q6A_HELP_DETAIL");
  });
});

describe("state-machine / ESCALATE", () => {
  it("symptom detail 에 응급 키워드 → ESCALATE", () => {
    const ctx = createCtx();
    const v: ClassifiedValue = {
      axis: "symptom",
      value: "severe",
      detail: "갑자기 가슴이 아파서 숨이 차요",
    };
    const r = decideNext("Q4A_SYMPTOM_DETAIL", v, ctx);
    expect(r.next_question_id).toBe("ESCALATE");
    expect(r.end).toBe(true);
    expect(ctx.escalatedReason).toMatch(/chest_pain|breathing/);
  });

  it("symptom keywords 배열에 응급 → ESCALATE", () => {
    const ctx = createCtx();
    const v: ClassifiedValue = {
      axis: "symptom",
      value: "severe",
      keywords: ["넘어졌어"],
    };
    const r = decideNext("Q4_SYMPTOM", v, ctx);
    expect(r.next_question_id).toBe("ESCALATE");
    expect(ctx.escalatedReason).toMatch(/^fall:/);
  });

  it("우울 키워드는 ESCALATE 아님", () => {
    const ctx = createCtx();
    const v: ClassifiedValue = {
      axis: "symptom",
      value: "mild",
      detail: "그냥 외로워",
    };
    const r = decideNext("Q4A_SYMPTOM_DETAIL", v, ctx);
    expect(r.next_question_id).not.toBe("ESCALATE");
  });
});

describe("state-machine / terminal & opening", () => {
  it("END_OK / END_WRONG / ESCALATE 는 terminal", () => {
    expect(isTerminal("END_OK")).toBe(true);
    expect(isTerminal("END_WRONG")).toBe(true);
    expect(isTerminal("ESCALATE")).toBe(true);
    expect(isTerminal("Q1_MOOD")).toBe(false);
  });

  it("endReason 매핑", () => {
    expect(endReason("END_OK")).toBe("normal");
    expect(endReason("END_WRONG")).toBe("wrong_person");
    expect(endReason("ESCALATE")).toBe("escalate");
  });

  it("openingPrompt 에 이름이 치환되고 첫 질문이 포함됨", () => {
    const p = openingPrompt("순자");
    expect(p).toContain("순자");
    expect(p).toContain("곁입니다");
    expect(p).toContain("기록됩니다");
  });

  it("FIRST_QUESTION 은 Q0_IDENTITY", () => {
    expect(FIRST_QUESTION).toBe("Q0_IDENTITY");
  });
});
