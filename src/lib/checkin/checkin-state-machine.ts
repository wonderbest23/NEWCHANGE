import {
  CHECKIN_STEPS,
  buildDefaultCheckinQuestionPlan,
  getPlannedStepById,
  type CheckinQuestionPlan,
  type CheckinStepId,
} from "@/lib/checkin/checkin-steps";
import { hasUrgentEvidenceRisk, type EvidenceRiskMatch } from "@/lib/checkin/evidence-risk";

export type CheckinMachineState = {
  currentStepId: CheckinStepId;
  questionPlan: CheckinQuestionPlan;
  unclearCount: Partial<Record<CheckinStepId, number>>;
  endRequestCount: number;
  completedStepIds: CheckinStepId[];
  escalated: boolean;
  ended: boolean;
};

export type CheckinMachineDecision = {
  state: CheckinMachineState;
  prompt: string;
  nextStepId: CheckinStepId | null;
  end: boolean;
  escalate: boolean;
  recordAnswer: boolean;
  unclear: boolean;
};

const FIRST_STEP_ID: CheckinStepId = CHECKIN_STEPS[0].id;
const MAX_UNCLEAR_PER_STEP = 2;

export function createInitialCheckinState(
  currentStepId: CheckinStepId = FIRST_STEP_ID,
  questionPlan: CheckinQuestionPlan = buildDefaultCheckinQuestionPlan(),
): CheckinMachineState {
  return {
    currentStepId,
    questionPlan,
    unclearCount: {},
    endRequestCount: 0,
    completedStepIds: [],
    escalated: false,
    ended: false,
  };
}

export function getOpeningPrompt(
  name?: string | null,
  memoryPrompt?: string | null,
  questionPlan: CheckinQuestionPlan = buildDefaultCheckinQuestionPlan(),
): string {
  const step = getPlannedStepById(FIRST_STEP_ID, questionPlan);
  const greeting = name?.trim()
    ? `${name.trim()}님, 안녕하세요. 오늘 안부를 짧게 여쭤볼게요.`
    : "안녕하세요. 오늘 안부를 짧게 여쭤볼게요.";
  const purpose = "제가 여쭤보는 이유는 어르신의 하루를 기록하고, 필요할 때 가족이나 보호자에게 잘 전달하기 위해서예요.";
  const memory = memoryPrompt?.trim();
  return [greeting, purpose, memory, step.prompt].filter(Boolean).join(" ");
}

export function getDirectedQuestionPrompt(
  stepId: CheckinStepId,
  questionPlan: CheckinQuestionPlan = buildDefaultCheckinQuestionPlan(),
): string {
  const step = getPlannedStepById(stepId, questionPlan);
  return [
    "아래 문장만 따뜻하고 또박또박 말하세요.",
    "다른 질문을 덧붙이지 말고, 사용자의 답변을 기다리세요.",
    `질문: ${step.prompt}`,
  ].join("\n");
}

export function decideAfterAnswer(input: {
  state: CheckinMachineState;
  answerText: string;
  riskMatches: EvidenceRiskMatch[];
  forceUnclear?: boolean;
}): CheckinMachineDecision {
  const { state, answerText, riskMatches, forceUnclear = false } = input;
  const currentStepId = state.currentStepId;
  const questionPlan = state.questionPlan.length ? state.questionPlan : buildDefaultCheckinQuestionPlan();
  const normalized = answerText.replace(/\s+/g, "");

  if (hasUrgentEvidenceRisk(riskMatches)) {
    return {
      state: { ...state, escalated: true, ended: true },
      prompt: [
        "지금 말씀은 바로 확인이 필요해요.",
        "혼자 계시면 보호자나 119에 바로 연락해 주세요.",
        "이 통화는 어르신의 하루를 기록하고 필요할 때 보호자에게 전달하기 위한 거예요.",
        "이 내용은 보호자에게 확인이 필요한 기록으로 남길게요. 통화를 마치겠습니다",
      ].join(" "),
      nextStepId: null,
      end: true,
      escalate: true,
      recordAnswer: true,
      unclear: false,
    };
  }

  if (isUserEnding(normalized)) {
    const allStepsCompleted = state.completedStepIds.length >= questionPlan.length;
    const endRequestCount = state.endRequestCount + 1;
    if (!allStepsCompleted && endRequestCount < 2) {
      const step = getPlannedStepById(currentStepId, questionPlan);
      return {
        state: { ...state, endRequestCount },
        prompt: [
          "아직 오늘 안부 기록이 충분하지 않아요.",
          "혹시 제가 잘못 들었을 수 있어서 바로 종료하지 않을게요.",
          "정말 마치려면 종료한다고 한 번 더 말씀해 주세요.",
          `괜찮으시면 이어서 대답해 주세요. ${step.prompt}`,
        ].join(" "),
        nextStepId: currentStepId,
        end: false,
        escalate: false,
        recordAnswer: false,
        unclear: true,
      };
    }
    return {
      state: { ...state, endRequestCount, ended: true },
      prompt: "알겠습니다. 오늘 말씀해 주셔서 고맙습니다. 통화를 마치겠습니다",
      nextStepId: null,
      end: true,
      escalate: false,
      recordAnswer: false,
      unclear: false,
    };
  }

  if (forceUnclear || isUnclearAnswerText(answerText)) {
    const count = (state.unclearCount[currentStepId] ?? 0) + 1;
    const nextUnclear = { ...state.unclearCount, [currentStepId]: count };
    if (count <= MAX_UNCLEAR_PER_STEP) {
      const step = getPlannedStepById(currentStepId, questionPlan);
      return {
        state: { ...state, unclearCount: nextUnclear },
        prompt: buildClarificationPrompt(answerText, step.prompt),
        nextStepId: currentStepId,
        end: false,
        escalate: false,
        recordAnswer: false,
        unclear: true,
      };
    }

    const currentIndex = questionPlan.findIndex((step) => step.id === currentStepId);
    const nextStep = questionPlan[currentIndex + 1];
    if (!nextStep) {
      return {
        state: { ...state, unclearCount: nextUnclear, ended: true },
        prompt: "목소리가 계속 약해서 이 항목은 추측해서 기록하지 않을게요. 오늘 통화를 마치겠습니다",
        nextStepId: null,
        end: true,
        escalate: false,
        recordAnswer: false,
        unclear: true,
      };
    }
    return {
      state: {
        ...state,
        currentStepId: nextStep.id,
        unclearCount: nextUnclear,
      },
      prompt: [
        "목소리가 계속 약해서 방금 항목은 추측해서 기록하지 않을게요.",
        getDirectedQuestionPrompt(nextStep.id, questionPlan),
      ].join(" "),
      nextStepId: nextStep.id,
      end: false,
      escalate: false,
      recordAnswer: false,
      unclear: true,
    };
  }

  const completedStepIds = Array.from(new Set([...state.completedStepIds, currentStepId]));
  const currentIndex = questionPlan.findIndex((step) => step.id === currentStepId);
  const nextStep = questionPlan[currentIndex + 1];

  if (!nextStep) {
    return {
      state: {
        ...state,
        completedStepIds,
        endRequestCount: 0,
        ended: true,
      },
      prompt: "오늘 말씀 나눠서 좋았어요. 제가 여쭤본 이유는 어르신의 하루를 기록하고 필요할 때 보호자에게 전달하기 위해서예요. 말씀해 주신 내용은 지금 기록으로 저장할게요. 통화를 마치겠습니다",
      nextStepId: null,
      end: true,
      escalate: false,
      recordAnswer: true,
      unclear: false,
    };
  }

  return {
    state: {
      ...state,
      currentStepId: nextStep.id,
      completedStepIds,
      endRequestCount: 0,
    },
    prompt: getDirectedQuestionPrompt(nextStep.id, questionPlan),
    nextStepId: nextStep.id,
    end: false,
    escalate: false,
    recordAnswer: true,
    unclear: false,
  };
}

export function isUnclearAnswerText(text: string): boolean {
  const normalized = text.replace(/\s+/g, "");
  if (!normalized) return true;
  if (/^(뭐|네\?|예\?|잘안들|잘안들려|잘못들|모르겠|몰라|다시|응\?|어\?|예\?)$/.test(normalized)) return true;
  if (/^(음|어|아|에|저|그|음음|어어)$/.test(normalized)) return true;
  return false;
}

function isUserEnding(normalized: string): boolean {
  return /(그만|끊어|끊을|종료|안녕히계세요|이만)/.test(normalized);
}

function buildClarificationPrompt(answerText: string, fallbackQuestion: string): string {
  const heard = answerText.trim();
  if (heard.length >= 1 && heard.length <= 24) {
    return [
      "어르신 목소리 인식이 약합니다.",
      `제가 "${heard}"라고 들었는데, 이렇게 말씀하신 게 맞으신가요?`,
      "맞으면 네, 아니면 다시 편하게 말씀해 주세요.",
    ].join(" ");
  }
  return `어르신 목소리 인식이 약합니다. 추측해서 기록하지 않을게요. 다시 한 번 또박또박 말씀해 주세요. ${fallbackQuestion}`;
}
