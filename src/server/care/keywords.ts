/**
 * 한국어 위험 키워드 사전 (정규식 + 동의어).
 *
 * 원칙:
 *  - 1차 매칭은 정규식. LLM은 패러프레이즈 보조.
 *  - false-positive 줄이기 위해 짧은 어간만 사용 (예: "쓰러졌" 모두 매칭).
 *  - 카테고리별 분리, evidence 에 카테고리/매칭문구 동시 기록.
 */

export type KeywordCategory =
  | "fall" // 낙상
  | "chest_pain" // 가슴통증
  | "breathing" // 호흡곤란
  | "stroke" // 뇌졸중 의심
  | "consciousness" // 의식 저하
  | "bleeding" // 출혈
  | "self_harm" // 자해/자살 표현
  | "depression" // 우울/불안
  | "side_effect"; // 약 부작용

export interface KeywordRule {
  category: KeywordCategory;
  /** 매칭 정규식 (한국어 어간 기준) */
  pattern: RegExp;
  /** 응급 분기 트리거 여부 */
  escalate: boolean;
}

export const KEYWORD_RULES: KeywordRule[] = [
  // 낙상
  { category: "fall", pattern: /(넘어졌|쓰러졌|미끄러졌|낙상)/, escalate: true },

  // 가슴 통증
  { category: "chest_pain", pattern: /(가슴이?\s*(아프|아파|답답|조이))/, escalate: true },

  // 호흡곤란
  { category: "breathing", pattern: /(숨이?\s*(차|막|안\s*쉬))|(숨쉬기\s*힘)/, escalate: true },

  // 뇌졸중 의심 (편마비 / 발음 장애)
  { category: "stroke", pattern: /(말이?\s*안\s*나|한쪽이?\s*안\s*움직|얼굴이?\s*돌아)/, escalate: true },

  // 의식
  { category: "consciousness", pattern: /(의식이?\s*(없|혼미|흐릿))|(정신이?\s*없)/, escalate: true },

  // 출혈
  { category: "bleeding", pattern: /(피가?\s*(나|많이))|(출혈)/, escalate: true },

  // 자해/자살
  { category: "self_harm", pattern: /(죽고\s*싶|살기\s*싫|혼자\s*죽)/, escalate: true },

  // 우울/불안 (발동은 누적, 단발 escalate X)
  { category: "depression", pattern: /(우울|쓸쓸|외로워|허전|기운이?\s*없|살기\s*힘)/, escalate: false },

  // 약 부작용
  { category: "side_effect", pattern: /(약\s*먹고\s*(어지|메스|토|두드러))|(부작용)/, escalate: false },
];

export interface KeywordMatch {
  category: KeywordCategory;
  matched: string;
  escalate: boolean;
}

/** 한 문장에서 매칭되는 모든 키워드를 반환 */
export function matchKeywords(text: string): KeywordMatch[] {
  if (!text) return [];
  const out: KeywordMatch[] = [];
  for (const rule of KEYWORD_RULES) {
    const m = text.match(rule.pattern);
    if (m) {
      out.push({ category: rule.category, matched: m[0], escalate: rule.escalate });
    }
  }
  return out;
}

/** 응급 분기가 필요한가 */
export function shouldEscalate(text: string): KeywordMatch | null {
  const matches = matchKeywords(text);
  return matches.find((m) => m.escalate) ?? null;
}
