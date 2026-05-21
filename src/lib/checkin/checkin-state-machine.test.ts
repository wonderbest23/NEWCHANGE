import { describe, expect, it } from "vitest";

import {
  createInitialCheckinState,
  decideAfterAnswer,
  getOpeningPrompt,
  isUnclearAnswerText,
} from "./checkin-state-machine";
import { detectEvidenceBasedRisks } from "./evidence-risk";
import { buildCheckinQuestionPlan, getMealPromptForKst } from "./checkin-steps";

describe("checkin-state-machine / unclear transcript handling", () => {
  it("목소리가 약하거나 애매한 답변은 추측해서 기록하지 않고 같은 질문을 확인한다", () => {
    const state = createInitialCheckinState("Q2_CONDITION");
    const decision = decideAfterAnswer({
      state,
      answerText: "어",
      riskMatches: [],
      forceUnclear: true,
    });

    expect(decision.unclear).toBe(true);
    expect(decision.recordAnswer).toBe(false);
    expect(decision.nextStepId).toBe("Q2_CONDITION");
    expect(decision.end).toBe(false);
    expect(decision.prompt).toContain("목소리 인식이 약합니다");
    expect(decision.prompt).toContain("맞으면 네");
  });

  it("반복해서 불명확하면 해당 항목은 기록하지 않고 다음 질문으로 넘어간다", () => {
    let state = createInitialCheckinState("Q3_PAIN");

    state = decideAfterAnswer({
      state,
      answerText: "음",
      riskMatches: [],
      forceUnclear: true,
    }).state;
    state = decideAfterAnswer({
      state,
      answerText: "어",
      riskMatches: [],
      forceUnclear: true,
    }).state;
    const decision = decideAfterAnswer({
      state,
      answerText: "아",
      riskMatches: [],
      forceUnclear: true,
    });

    expect(decision.unclear).toBe(true);
    expect(decision.recordAnswer).toBe(false);
    expect(decision.nextStepId).toBe("Q4_MEDICINE");
    expect(decision.prompt).toContain("추측해서 기록하지 않을게요");
  });

  it("마지막 질문이 반복해서 불명확하면 추측 저장 없이 종료한다", () => {
    let state = createInitialCheckinState("Q6_HELP");

    state = decideAfterAnswer({
      state,
      answerText: "음",
      riskMatches: [],
      forceUnclear: true,
    }).state;
    state = decideAfterAnswer({
      state,
      answerText: "어",
      riskMatches: [],
      forceUnclear: true,
    }).state;
    const decision = decideAfterAnswer({
      state,
      answerText: "아",
      riskMatches: [],
      forceUnclear: true,
    });

    expect(decision.end).toBe(true);
    expect(decision.recordAnswer).toBe(false);
    expect(decision.prompt).toContain("통화를 마치겠습니다");
  });
});

describe("checkin-state-machine / safety and completion", () => {
  it("첫 식사 답변이 부정적이어도 종료하지 않고 다음 질문으로 이어간다", () => {
    const decision = decideAfterAnswer({
      state: createInitialCheckinState("Q1_MEAL"),
      answerText: "밥 못 먹었어",
      riskMatches: [],
    });

    expect(decision.end).toBe(false);
    expect(decision.recordAnswer).toBe(true);
    expect(decision.nextStepId).toBe("Q2_CONDITION");
    expect(decision.prompt).toContain("오늘 몸은 어떠세요");
  });

  it("초반 종료 표현은 한 번에 종료하지 않고 잘못 들었을 가능성을 확인한다", () => {
    const decision = decideAfterAnswer({
      state: createInitialCheckinState("Q1_MEAL"),
      answerText: "종료",
      riskMatches: [],
    });

    expect(decision.end).toBe(false);
    expect(decision.recordAnswer).toBe(false);
    expect(decision.nextStepId).toBe("Q1_MEAL");
    expect(decision.prompt).toContain("바로 종료하지 않을게요");
  });

  it("사용자가 종료 의사를 두 번 말하면 종료한다", () => {
    const first = decideAfterAnswer({
      state: createInitialCheckinState("Q1_MEAL"),
      answerText: "종료",
      riskMatches: [],
    });
    const second = decideAfterAnswer({
      state: first.state,
      answerText: "종료할게",
      riskMatches: [],
    });

    expect(second.end).toBe(true);
    expect(second.recordAnswer).toBe(false);
    expect(second.prompt).toContain("통화를 마치겠습니다");
  });

  it("출처 기반 긴급 표현은 일반 질문을 중단하고 종료 안내로 전환한다", () => {
    const riskMatches = detectEvidenceBasedRisks([
      { role: "user", text: "쇼크 상태가 온 것 같아요. 식은땀이 나요." },
    ]);
    const decision = decideAfterAnswer({
      state: createInitialCheckinState("Q2_CONDITION"),
      answerText: "쇼크 상태가 온 것 같아요. 식은땀이 나요.",
      riskMatches,
    });

    expect(decision.escalate).toBe(true);
    expect(decision.end).toBe(true);
    expect(decision.recordAnswer).toBe(true);
    expect(decision.nextStepId).toBeNull();
  });

  it("짧은 긍정 답변은 불명확 답변으로 오분류하지 않는다", () => {
    expect(isUnclearAnswerText("네")).toBe(false);
    expect(isUnclearAnswerText("응")).toBe(false);
    expect(isUnclearAnswerText("예?")).toBe(true);
  });
});

describe("checkin question plan / KST meal prompt", () => {
  it("한국시간 아침에는 아침 식사 질문을 한다", () => {
    const prompt = getMealPromptForKst(new Date("2026-05-20T00:30:00.000Z"));
    expect(prompt).toContain("아침 식사");
  });

  it("한국시간 점심에는 점심과 아침 누락을 함께 확인한다", () => {
    const prompt = getMealPromptForKst(new Date("2026-05-20T03:30:00.000Z"));
    expect(prompt).toContain("점심");
    expect(prompt).toContain("아침");
  });

  it("오늘 질문 계획의 식사 질문이 첫 인사에 반영된다", () => {
    const plan = buildCheckinQuestionPlan(new Date("2026-05-20T10:30:00.000Z"));
    const opening = getOpeningPrompt("홍길동", null, plan);
    expect(opening).toContain("저녁 식사");
  });

  it("출처 turn이 있는 기억은 해당 질문 하나만 개인화한다", () => {
    const plan = buildCheckinQuestionPlan(new Date("2026-05-20T03:30:00.000Z"), {
      memoryType: "pain",
      content: "최근 무릎 통증이나 불편을 말씀하신 기록이 있어요.",
      evidenceTurnId: "turn-1",
      evidenceCheckinId: "checkin-1",
    });

    expect(plan.find((step) => step.id === "Q3_PAIN")?.prompt).toContain("무릎 통증");
    expect(plan.find((step) => step.id === "Q3_PAIN")?.personalizationReason).toBe("memory:pain");
    expect(plan.filter((step) => step.personalizationReason?.startsWith("memory:"))).toHaveLength(1);
  });

  it("출처 turn이 없는 기억은 질문에 반영하지 않는다", () => {
    const plan = buildCheckinQuestionPlan(new Date("2026-05-20T03:30:00.000Z"), {
      memoryType: "medicine",
      content: "최근 약 복용을 확인해야 한다고 말씀하신 기록이 있어요.",
      evidenceTurnId: null,
      evidenceCheckinId: "checkin-1",
    });

    expect(plan.find((step) => step.id === "Q4_MEDICINE")?.personalizationReason).toBeUndefined();
    expect(plan.find((step) => step.id === "Q4_MEDICINE")?.prompt).toBe("오늘 드셔야 할 약은 챙기셨어요?");
  });
});
