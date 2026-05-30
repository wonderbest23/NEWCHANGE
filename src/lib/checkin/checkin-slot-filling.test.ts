import { describe, expect, it } from "vitest";
import {
  buildConversationalTransitionPrompt,
  getMissingStepIds,
  inferCompletedStepsFromText,
} from "@/lib/checkin/checkin-slot-filling";
import { buildDefaultCheckinQuestionPlan } from "@/lib/checkin/checkin-steps";

describe("checkin-slot-filling", () => {
  it("infers meal and mood from a single utterance", () => {
    const ids = inferCompletedStepsFromText("아침은 먹었고 기분은 그냥 그래요");
    expect(ids).toContain("Q1_MEAL");
    expect(ids).toContain("Q5_MOOD");
  });

  it("returns missing steps in plan order", () => {
    const plan = buildDefaultCheckinQuestionPlan();
    const missing = getMissingStepIds(plan, ["Q1_MEAL", "Q2_CONDITION"]);
    expect(missing[0]).toBe("Q3_PAIN");
  });

  it("builds conversational transition with empathy", () => {
    const prompt = buildConversationalTransitionPrompt({
      nextStepId: "Q3_PAIN",
      questionPlan: buildDefaultCheckinQuestionPlan(),
      lastAnswer: "밥은 먹었어요",
      inferredStepIds: ["Q1_MEAL"],
    });
    expect(prompt).toMatch(/아프|불편/);
    expect(prompt).toMatch(/그러셨|들었|고맙/);
  });
});
