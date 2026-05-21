import { detectEvidenceBasedRisks, type EvidenceRiskMatch } from "@/lib/checkin/evidence-risk";

export const CHECKIN_STEPS = [
  {
    id: "Q1_MEAL",
    label: "식사",
    prompt: "오늘 식사는 하셨어요?",
    keywords: [/식사|밥|아침|점심|저녁|드셨|먹었|입맛/],
  },
  {
    id: "Q2_CONDITION",
    label: "몸 상태",
    prompt: "오늘 몸은 어떠세요?",
    keywords: [/몸|컨디션|기운|어떠|피곤|어지러|힘들/],
  },
  {
    id: "Q3_PAIN",
    label: "통증과 불편",
    prompt: "아픈 곳이나 불편한 곳은 있으세요?",
    keywords: [/아픈|아프|통증|불편|쑤시|저리|무릎|허리|머리|가슴|숨/],
  },
  {
    id: "Q4_MEDICINE",
    label: "약",
    prompt: "오늘 드셔야 할 약은 챙기셨어요?",
    keywords: [/약|복용|드셔야|챙기|먹었|처방/],
  },
  {
    id: "Q5_MOOD",
    label: "기분",
    prompt: "오늘 기분은 어떠세요?",
    keywords: [/기분|마음|외롭|우울|좋|불안|화|쓸쓸/],
  },
  {
    id: "Q6_HELP",
    label: "도움 요청",
    prompt: "가족에게 전하고 싶은 말이나 부탁할 일이 있으세요?",
    keywords: [/가족|자녀|보호자|부탁|도움|전하|필요/],
  },
] as const;

export type CheckinStepId = (typeof CHECKIN_STEPS)[number]["id"];
export type CheckinBaseStep = (typeof CHECKIN_STEPS)[number];
export type PlannedCheckinStep = Omit<CheckinBaseStep, "prompt"> & {
  prompt: string;
  personalizationReason?: string;
};
export type CheckinQuestionPlan = PlannedCheckinStep[];

export type CheckinStepAnswer = {
  stepId: CheckinStepId;
  stepLabel: string;
  question: string;
  answer: string;
  askedAt?: number;
  answeredAt: number;
  riskMatches: EvidenceRiskMatch[];
};

type TranscriptTurn = {
  role: "user" | "ai";
  text: string;
  ts?: number;
  partial?: boolean;
};

export function inferStepFromAssistantText(text: string): CheckinStepId | null {
  const normalized = text.replace(/\s+/g, " ");
  for (const step of CHECKIN_STEPS) {
    if (step.keywords.some((keyword) => keyword.test(normalized))) return step.id;
  }
  return null;
}

export function getStepById(stepId: CheckinStepId) {
  return CHECKIN_STEPS.find((step) => step.id === stepId) ?? CHECKIN_STEPS[0];
}

export function getPlannedStepById(
  stepId: CheckinStepId,
  questionPlan: CheckinQuestionPlan = buildDefaultCheckinQuestionPlan(),
) {
  return questionPlan.find((step) => step.id === stepId) ?? questionPlan[0] ?? getStepById(stepId);
}

export function buildDefaultCheckinQuestionPlan(): CheckinQuestionPlan {
  return CHECKIN_STEPS.map((step) => ({ ...step }));
}

export type MealTimeSlot = "breakfast" | "lunch" | "dinner" | "late";
export type CheckinPlanMemory = {
  memoryType: string;
  content: string;
  evidenceCheckinId?: string | null;
  evidenceTurnId?: string | null;
} | null;

export function getKoreanMealTimeSlot(now = new Date()): MealTimeSlot {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 21) return "dinner";
  return "late";
}

export function getMealPromptForKst(now = new Date()): string {
  const slot = getKoreanMealTimeSlot(now);
  if (slot === "breakfast") {
    return "아침 식사는 하셨어요? 못 드셨다면 언제쯤 드실 수 있을지도 말씀해 주세요.";
  }
  if (slot === "lunch") {
    return "점심은 드셨어요? 아침을 거르셨다면 그것도 같이 말씀해 주세요.";
  }
  if (slot === "dinner") {
    return "저녁 식사는 하셨어요? 오늘 아침이나 점심을 거른 적이 있는지도 말씀해 주세요.";
  }
  return "오늘 마지막으로 식사하신 게 언제예요? 못 드셨다면 어떤 끼니를 못 드셨는지 말씀해 주세요.";
}

export function buildCheckinQuestionPlan(
  now = new Date(),
  memory: CheckinPlanMemory = null,
): CheckinQuestionPlan {
  const memoryTargetStepId = getMemoryTargetStepId(memory?.memoryType);
  return CHECKIN_STEPS.map((step) => {
    const base: PlannedCheckinStep = step.id === "Q1_MEAL"
      ? {
          ...step,
          prompt: getMealPromptForKst(now),
          personalizationReason: "kst_meal_time",
        }
      : { ...step };

    if (!memory || step.id !== memoryTargetStepId) return base;

    const prompt = buildMemoryBasedPrompt(base.prompt, memory);
    if (!prompt) return base;
    return {
      ...step,
      prompt,
      personalizationReason: `memory:${memory.memoryType}`,
    };
  });
}

function getMemoryTargetStepId(memoryType?: string | null): CheckinStepId | null {
  if (!memoryType) return null;
  if (memoryType === "meal") return "Q1_MEAL";
  if (memoryType === "medicine") return "Q4_MEDICINE";
  if (memoryType === "pain") return "Q3_PAIN";
  if (memoryType === "dizziness") return "Q2_CONDITION";
  if (memoryType === "mood" || memoryType === "loneliness") return "Q5_MOOD";
  return null;
}

function buildMemoryBasedPrompt(basePrompt: string, memory: NonNullable<CheckinPlanMemory>): string | null {
  const content = memory.content.trim();
  if (!content || !memory.evidenceTurnId) return null;

  if (memory.memoryType === "meal") {
    return `지난 기록에 ${content} ${basePrompt}`;
  }
  if (memory.memoryType === "medicine") {
    return `지난 기록에 ${content} 오늘 드셔야 할 약은 차분히 챙기셨어요?`;
  }
  if (memory.memoryType === "pain") {
    return `지난 기록에 ${content} 오늘 그 부위나 다른 곳이 불편하신지 말씀해 주세요.`;
  }
  if (memory.memoryType === "dizziness") {
    return `지난 기록에 ${content} 오늘은 어지럽거나 기운이 빠지는 느낌은 없으세요?`;
  }
  if (memory.memoryType === "mood") {
    return `지난 기록에 ${content} 오늘 마음은 어제보다 어떠셨어요?`;
  }
  if (memory.memoryType === "loneliness") {
    return `지난 기록에 ${content} 오늘은 누군가와 이야기 나누셨거나 외로운 순간은 없으셨어요?`;
  }
  return null;
}

export function buildCheckinStepAnswers(transcript: TranscriptTurn[]): CheckinStepAnswer[] {
  const clean = transcript.filter((turn) => turn.text.trim().length > 0 && !turn.partial);
  const answers: CheckinStepAnswer[] = [];
  let currentStepId: CheckinStepId = CHECKIN_STEPS[0].id;
  let currentQuestion = CHECKIN_STEPS[0].prompt;
  let askedAt: number | undefined;

  for (const turn of clean) {
    if (turn.role === "ai") {
      const inferred = inferStepFromAssistantText(turn.text);
      if (inferred) {
        currentStepId = inferred;
        currentQuestion = turn.text.trim();
        askedAt = turn.ts;
      }
      continue;
    }

    const step = getStepById(currentStepId);
    answers.push({
      stepId: step.id,
      stepLabel: step.label,
      question: currentQuestion || step.prompt,
      answer: turn.text.trim(),
      askedAt,
      answeredAt: turn.ts ?? Date.now(),
      riskMatches: detectEvidenceBasedRisks([{ role: "user", text: turn.text }]),
    });
  }

  return answers;
}

export function formatStepAnswersForTranscript(answers: CheckinStepAnswer[]): string {
  if (answers.length === 0) return "";
  return [
    "[질문별 구조화 기록]",
    ...answers.map((answer, index) => {
      const risks = answer.riskMatches.length
        ? `\n  위험/주의 근거: ${answer.riskMatches
            .map((risk) => `${risk.severity}:${risk.category}(${risk.matchedTerms.join(", ")})`)
            .join("; ")}`
        : "";
      return `${index + 1}. ${answer.stepLabel} (${answer.stepId})\n  AI 질문: ${answer.question}\n  어르신 답변: ${answer.answer}${risks}`;
    }),
  ].join("\n");
}
