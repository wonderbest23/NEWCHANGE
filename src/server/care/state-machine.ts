/**
 * Conversation State Machine
 *
 * AI Realtime 이 tool_call 로 record_answer 를 보내면 이 모듈이
 * 다음 질문 ID + 발화 prompt 를 결정한다.
 *
 * 결정주의:
 *  - LLM 의 자유 의지 없음. 모든 분기는 이 표 기반.
 *  - unclear 응답은 한 번만 재질문 허용.
 *  - 응급 키워드 → ESCALATE 즉시 점프.
 */

import type {
  ClassifiedValue,
  QuestionId,
  ToolResponse,
  CallEndReason,
} from "./types";
import { shouldEscalate } from "./keywords";

// ─────────────────────────────────────────────────────────────────────────────
// 질문 카탈로그
// ─────────────────────────────────────────────────────────────────────────────

interface QuestionNode {
  id: QuestionId;
  prompt: string;
  /** 다음 노드 결정. null 반환 시 end_call. */
  next: (value: ClassifiedValue | null, ctx: SmCtx) => QuestionId | null;
  terminal?: boolean;
  endReason?: CallEndReason;
}

export interface SmCtx {
  /** 같은 질문 unclear 횟수 */
  unclearCount: Record<string, number>;
  /** 부재중 keyword/위급 매칭 누적 */
  escalatedReason?: string;
}

export function createCtx(): SmCtx {
  return { unclearCount: {} };
}

const NODES: Record<QuestionId, QuestionNode> = {
  Q0_IDENTITY: {
    id: "Q0_IDENTITY",
    prompt: "{name}님 맞으세요?",
    next: (v) => {
      if (!v || v.axis !== "greeting") return "Q0_IDENTITY";
      if (v.value === "good") return "Q1_MOOD";
      if (v.value === "bad") return "END_WRONG";
      return "Q0_IDENTITY"; // unclear → 재질문 (호출측에서 횟수 제한)
    },
  },

  Q1_MOOD: {
    id: "Q1_MOOD",
    prompt: "오늘 기분은 어떠세요?",
    next: () => "Q2_MEAL",
  },

  Q2_MEAL: {
    id: "Q2_MEAL",
    prompt: "오늘 식사는 하셨어요?",
    next: (v) => {
      if (v?.axis === "meal" && v.value === "skipped") return "Q2A_MEAL_REASON";
      return "Q3_MEDICATION";
    },
  },

  Q2A_MEAL_REASON: {
    id: "Q2A_MEAL_REASON",
    prompt: "식사를 못 하신 이유가 있으세요?",
    next: () => "Q3_MEDICATION",
  },

  Q3_MEDICATION: {
    id: "Q3_MEDICATION",
    prompt: "오늘 드셔야 할 약은 챙기셨어요?",
    next: (v) => {
      if (v?.axis === "medication" && v.value === "missed") return "Q3A_MED_REASON";
      return "Q4_SYMPTOM";
    },
  },

  Q3A_MED_REASON: {
    id: "Q3A_MED_REASON",
    prompt: "약을 못 드신 이유가 있으세요?",
    next: () => "Q4_SYMPTOM",
  },

  Q4_SYMPTOM: {
    id: "Q4_SYMPTOM",
    prompt: "오늘 어디 불편하신 데 있으세요?",
    next: (v) => {
      if (v?.axis === "symptom" && v.value === "severe") return "Q4A_SYMPTOM_DETAIL";
      return "Q5_SLEEP";
    },
  },

  Q4A_SYMPTOM_DETAIL: {
    id: "Q4A_SYMPTOM_DETAIL",
    prompt: "어떻게 불편하신지 한 마디만 더 들려주세요.",
    next: (v) => {
      if (v?.axis === "symptom" && v.detail) {
        const esc = shouldEscalate(v.detail);
        if (esc) return "ESCALATE";
      }
      return "Q5_SLEEP";
    },
  },

  Q5_SLEEP: {
    id: "Q5_SLEEP",
    prompt: "어젯밤은 잘 주무셨어요?",
    next: () => "Q6_HELP",
  },

  Q6_HELP: {
    id: "Q6_HELP",
    prompt: "오늘 자녀 분께 부탁할 일 있으세요?",
    next: (v) => {
      if (v?.axis === "help" && v.value === "has_request") return "Q6A_HELP_DETAIL";
      return "END_OK";
    },
  },

  Q6A_HELP_DETAIL: {
    id: "Q6A_HELP_DETAIL",
    prompt: "어떤 도움이 필요하신지 짧게 말씀해 주세요.",
    next: () => "END_OK",
  },

  END_OK: {
    id: "END_OK",
    prompt: "오늘도 건강하세요. 안녕히 계세요.",
    next: () => null,
    terminal: true,
    endReason: "normal",
  },

  END_WRONG: {
    id: "END_WRONG",
    prompt: "죄송합니다. 잘못 걸었네요. 좋은 하루 되세요.",
    next: () => null,
    terminal: true,
    endReason: "wrong_person",
  },

  ESCALATE: {
    id: "ESCALATE",
    prompt: "지금 자녀 분께 바로 알려드릴게요. 잠시만요.",
    next: () => null,
    terminal: true,
    endReason: "escalate",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────────────────────────────────────

export const FIRST_QUESTION: QuestionId = "Q0_IDENTITY";

// 운영 중 튜닝 가능하게 env 로 오버라이드.
// 너무 높이면 통화가 길어지고 어르신 피로도가 올라간다. 기본 1회 권장.
function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const MAX_UNCLEAR_PER_QUESTION = readPositiveInt(
  process.env.CARE_MAX_UNCLEAR_PER_QUESTION,
  1,
);
export const HARD_TIMEOUT_SEC = readPositiveInt(
  process.env.CARE_CALL_HARD_TIMEOUT_SEC,
  5 * 60,
);
export const SILENCE_TIMEOUT_SEC = readPositiveInt(
  process.env.CARE_CALL_SILENCE_TIMEOUT_SEC,
  15,
);

export function getPrompt(id: QuestionId, vars: Record<string, string> = {}): string {
  const node = NODES[id];
  if (!node) throw new Error(`unknown question: ${id}`);
  return node.prompt.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

export function isTerminal(id: QuestionId): boolean {
  return !!NODES[id].terminal;
}

export function endReason(id: QuestionId): CallEndReason | undefined {
  return NODES[id].endReason;
}

/**
 * 다음 질문 결정.
 *
 * - value가 unclear이면 같은 질문 재질문 (MAX_UNCLEAR_PER_QUESTION 까지)
 * - 그 이상 unclear → 그대로 다음 노드로 넘어감 (피로 누적 방지)
 * - 응급 키워드 매칭 시 ESCALATE 점프
 */
export function decideNext(
  current: QuestionId,
  value: ClassifiedValue | null,
  ctx: SmCtx,
): ToolResponse {
  // 응급 키워드 우선
  if (value && "detail" in value && value.detail) {
    const esc = shouldEscalate(value.detail);
    if (esc) {
      ctx.escalatedReason = `${esc.category}:${esc.matched}`;
      return { next_question_id: "ESCALATE", prompt: getPrompt("ESCALATE"), end: true };
    }
  }
  if (value && "keywords" in value && value.keywords?.length) {
    for (const kw of value.keywords) {
      const esc = shouldEscalate(kw);
      if (esc) {
        ctx.escalatedReason = `${esc.category}:${esc.matched}`;
        return { next_question_id: "ESCALATE", prompt: getPrompt("ESCALATE"), end: true };
      }
    }
  }

  // unclear 처리
  const isUnclear =
    value === null ||
    (("value" in value) && (value as { value?: string }).value === "unclear");

  if (isUnclear) {
    const cnt = (ctx.unclearCount[current] ?? 0) + 1;
    ctx.unclearCount[current] = cnt;
    if (cnt <= MAX_UNCLEAR_PER_QUESTION) {
      return {
        next_question_id: current,
        prompt: `다시 한 번 여쭤볼게요. ${getPrompt(current)}`,
      };
    }
    // 두 번째 unclear → 강제로 다음 질문
  }

  const node = NODES[current];
  const nextId = node.next(value, ctx);
  if (!nextId) {
    return { next_question_id: null, end: true };
  }
  const nextNode = NODES[nextId];
  return {
    next_question_id: nextId,
    prompt: getPrompt(nextId),
    end: !!nextNode.terminal,
  };
}

/** 시작용 첫 prompt — 영어 금지 가드를 함께 주입 */
export function openingPrompt(recipientName: string): string {
  const koreanOnly =
    "응답은 반드시 한국어로만 하세요. 영어 단어나 'thank you', 'ok', '땡큐', '오케이' 등은 " +
    "어떤 변형도 사용하지 않습니다. 다음 문장만 그대로 말하세요. ";
  const greeting = [
    "안녕하세요, 곁입니다.",
    "자녀 분이 신청하신 안부 확인 전화이고, 통화는 기록됩니다.",
    getPrompt(FIRST_QUESTION, { name: recipientName }),
  ].join(" ");
  return koreanOnly + greeting;
}
