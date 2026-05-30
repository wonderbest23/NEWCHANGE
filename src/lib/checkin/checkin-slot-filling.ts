import {
  CHECKIN_STEPS,
  getPlannedStepById,
  type CheckinQuestionPlan,
  type CheckinStepId,
} from "@/lib/checkin/checkin-steps";

const REASK_VARIANTS: Partial<Record<CheckinStepId, string[]>> = {
  Q1_MEAL: [
    "식사는 어떻게 하셨어요?",
    "밥은 드셨는지 궁금해요.",
    "오늘 끼니는 어떠셨어요?",
  ],
  Q2_CONDITION: [
    "오늘 몸은 좀 어떠세요?",
    "컨디션은 괜찮으세요?",
  ],
  Q3_PAIN: [
    "아프거나 불편한 곳은 없으세요?",
    "어디 아픈 데는 없으신가요?",
  ],
  Q4_MEDICINE: [
    "약은 잘 챙겨 드셨어요?",
    "오늘 드실 약은 거뜬하셨어요?",
  ],
  Q5_MOOD: [
    "오늘 기분은 어떠세요?",
    "마음은 좀 어떠세요?",
  ],
  Q6_HELP: [
    "가족에게 전하고 싶은 말 있으세요?",
    "혹시 도움이 필요한 일은 없으세요?",
  ],
};

const EMPATHY_NEUTRAL = ["아, 그러셨군요.", "네, 잘 들었어요.", "고맙습니다, 말씀해 주셔서."];
const EMPATHY_POSITIVE = ["다행이네요.", "좋으셨겠어요.", "기분 좋은 이야기네요."];
const EMPATHY_CAUTION = ["걱정되네요.", "힘드셨겠어요.", "많이 불편하셨겠어요."];

export function inferCompletedStepsFromText(text: string): CheckinStepId[] {
  const normalized = text.replace(/\s+/g, " ");
  return CHECKIN_STEPS
    .filter((step) => step.keywords.some((keyword) => keyword.test(normalized)))
    .map((step) => step.id);
}

export function getMissingStepIds(
  questionPlan: CheckinQuestionPlan,
  completedStepIds: CheckinStepId[],
): CheckinStepId[] {
  const completed = new Set(completedStepIds);
  return questionPlan.map((step) => step.id).filter((id) => !completed.has(id));
}

/** 현재 질문 이후를 우선하고, 빠진 항목이 있으면 앞쪽부터 다시 채운다. */
export function getNextStepToAsk(
  currentStepId: CheckinStepId,
  completedStepIds: CheckinStepId[],
  questionPlan: CheckinQuestionPlan,
): CheckinStepId | null {
  const completed = new Set(completedStepIds);
  const currentIndex = questionPlan.findIndex((step) => step.id === currentStepId);

  for (let i = currentIndex + 1; i < questionPlan.length; i += 1) {
    const id = questionPlan[i].id;
    if (!completed.has(id)) return id;
  }
  for (const step of questionPlan) {
    if (!completed.has(step.id)) return step.id;
  }
  return null;
}

export function pickEmpathyPhrase(answerText: string): string {
  const normalized = answerText.replace(/\s+/g, "");
  const pick = (pool: string[]) => pool[normalized.length % pool.length];
  if (/(아파|아프|힘들|어지|불편|걱정|외로|우울|못\s*먹|안\s*먹|거의\s*못)/.test(normalized)) {
    return pick(EMPATHY_CAUTION);
  }
  if (/(좋|괜찮|잘\s*먹|드셨|챙겼|행복|기분\s*좋)/.test(normalized)) {
    return pick(EMPATHY_POSITIVE);
  }
  return pick(EMPATHY_NEUTRAL);
}

export function buildMissingSlotPrompt(input: {
  stepId: CheckinStepId;
  questionPlan: CheckinQuestionPlan;
  lastAnswer?: string;
  unclearAttempt?: number;
  alreadyHintedInLastAnswer?: boolean;
}): string {
  const step = getPlannedStepById(input.stepId, input.questionPlan);
  const empathy = input.lastAnswer ? pickEmpathyPhrase(input.lastAnswer) : "";
  const variants = REASK_VARIANTS[input.stepId] ?? [step.prompt];
  const variantIndex = Math.min(input.unclearAttempt ?? 0, variants.length - 1);
  const question = variants[variantIndex] ?? step.prompt;

  if (input.alreadyHintedInLastAnswer) {
    return [
      empathy,
      `아까 말씀 중에 ${step.label} 이야기가 나와서 확인만 할게요.`,
      question,
    ].filter(Boolean).join(" ");
  }

  return [empathy, question].filter(Boolean).join(" ");
}

export function buildConversationalTransitionPrompt(input: {
  nextStepId: CheckinStepId;
  questionPlan: CheckinQuestionPlan;
  lastAnswer: string;
  unclearAttempt?: number;
  inferredStepIds?: CheckinStepId[];
}): string {
  const alreadyHinted = (input.inferredStepIds ?? []).includes(input.nextStepId);
  return buildMissingSlotPrompt({
    stepId: input.nextStepId,
    questionPlan: input.questionPlan,
    lastAnswer: input.lastAnswer,
    unclearAttempt: input.unclearAttempt,
    alreadyHintedInLastAnswer: alreadyHinted,
  });
}

export function buildClosingSummaryPrompt(completedLabels: string[]): string {
  const items = completedLabels.length > 0 ? completedLabels.join(", ") : "오늘 안부";
  return [
    "오늘 말씀 나눠서 좋았어요.",
    `${items} 내용은 지금 기록으로 남길게요.`,
    "제가 여쭤본 이유는 어르신의 하루를 기록하고 필요할 때 보호자에게 전달하기 위해서예요.",
    "통화를 마치겠습니다",
  ].join(" ");
}
