export type EvidenceRiskSeverity = "caution" | "urgent";

export type EvidenceRiskSource = {
  name: string;
  url: string;
  accessedAt: string;
};

export type EvidenceRiskMatch = {
  category: string;
  severity: EvidenceRiskSeverity;
  rawText: string;
  matchedTerms: string[];
  rationale: string;
  recommendedAction: string;
  sources: EvidenceRiskSource[];
  turnIndex?: number;
};

type TranscriptTurn = {
  role: "user" | "ai";
  text: string;
};

const MAYO_SHOCK: EvidenceRiskSource = {
  name: "Mayo Clinic, Shock: First aid, 2026-04-22",
  url: "https://www.mayoclinic.org/first-aid/first-aid-shock/basics/art-20056620",
  accessedAt: "2026-05-19",
};

const CDC_TBI: EvidenceRiskSource = {
  name: "CDC, Symptoms of Mild TBI and Concussion, 2025-09-15",
  url: "https://www.cdc.gov/traumatic-brain-injury/signs-symptoms/index.html",
  accessedAt: "2026-05-19",
};

const CDC_MIS_EMERGENCY: EvidenceRiskSource = {
  name: "CDC, Signs and Symptoms of MIS, 2026-02-19",
  url: "https://www.cdc.gov/mis/signs-symptoms/index.html",
  accessedAt: "2026-05-19",
};

const shockSymptomRules: Array<{ label: string; pattern: RegExp }> = [
  { label: "식은땀/축축한 피부", pattern: /(식은땀|진땀|피부가?\s*(차갑|축축))/, },
  { label: "창백함", pattern: /(창백|얼굴이?\s*(하얗|하얘|핏기\s*없))/, },
  { label: "입술/손톱 청색 또는 회색 변화", pattern: /(입술|손톱).{0,8}(파랗|푸르|회색|잿빛)/, },
  { label: "빠른 맥박", pattern: /(맥박|심장).{0,8}(빠르|빨라|두근|뛰)/, },
  { label: "빠르거나 얕은 호흡", pattern: /(숨|호흡).{0,10}(가쁘|빠르|얕|헐떡|차|막히|안\s*쉬)/, },
  { label: "구토/메스꺼움", pattern: /(구토|토했|토할|메스꺼|울렁)/, },
  { label: "극심한 쇠약", pattern: /(극심|너무|많이).{0,8}(약하|힘이?\s*없|기운이?\s*없)/, },
  { label: "어지러움/실신", pattern: /(어지러|현기증|실신|기절|쓰러질\s*것|쓰러질거)/, },
  { label: "혼란/불안정한 의식", pattern: /(혼란|정신이?\s*없|의식이?\s*(흐릿|없|혼미)|헷갈)/, },
];

const immediateUrgentRules: Array<{
  category: string;
  pattern: RegExp;
  matchedLabel: string;
  rationale: string;
  sources: EvidenceRiskSource[];
}> = [
  {
    category: "shock_reported",
    pattern: /(쇼크|shock)/i,
    matchedLabel: "쇼크 언급",
    rationale: "사용자가 쇼크 상태 또는 쇼크 의심을 직접 언급했습니다. 쇼크가 의심되면 응급 의료 도움을 요청해야 한다는 출처 기준에 따라 긴급으로 기록합니다.",
    sources: [MAYO_SHOCK],
  },
  {
    category: "chest_pain_or_pressure",
    pattern: /(가슴|흉부).{0,10}(아프|통증|답답|압박|조이|쥐어짜)/,
    matchedLabel: "가슴 통증/압박",
    rationale: "가슴 통증 또는 압박은 즉시 확인이 필요한 응급 신호로 분류합니다.",
    sources: [CDC_MIS_EMERGENCY],
  },
  {
    category: "breathing_trouble",
    pattern: /(숨|호흡).{0,10}(곤란|힘들|막히|안\s*쉬|못\s*쉬|가쁘|차)/,
    matchedLabel: "호흡 곤란",
    rationale: "호흡 곤란은 즉시 확인이 필요한 응급 신호로 분류합니다.",
    sources: [CDC_MIS_EMERGENCY, MAYO_SHOCK],
  },
  {
    category: "loss_of_consciousness",
    pattern: /(의식이?\s*(없|혼미)|기절|실신|깨워도\s*안|못\s*깨)/,
    matchedLabel: "의식 저하/실신",
    rationale: "의식 저하, 실신, 깨우기 어려움은 즉시 확인이 필요한 응급 신호로 분류합니다.",
    sources: [CDC_TBI, MAYO_SHOCK],
  },
  {
    category: "stroke_like_sign",
    pattern: /(말이?\s*(어눌|안\s*나|꼬이)|발음이?\s*이상|한쪽이?\s*(마비|안\s*움직|힘이?\s*빠)|얼굴이?\s*(돌아|처지))|((팔|다리).{0,8}(저리|마비))|경련|발작/,
    matchedLabel: "신경학적 위험 신호",
    rationale: "말 어눌함, 한쪽 약화/마비, 경련 등은 CDC가 제시한 즉시 응급 확인 신호와 맞닿아 있어 긴급으로 기록합니다.",
    sources: [CDC_TBI],
  },
  {
    category: "repeated_vomiting_after_head_injury",
    pattern: /(머리|머릴|머리를|넘어|넘어졌|부딪|낙상).{0,30}(구토|토했|계속\s*토|반복.*토)|(구토|토했|계속\s*토|반복.*토).{0,30}(머리|머릴|머리를|넘어|넘어졌|부딪|낙상)/,
    matchedLabel: "머리 충격 후 반복 구토 의심",
    rationale: "머리 충격 이후 반복 구토는 CDC가 제시한 즉시 응급 확인 신호에 해당할 수 있어 긴급으로 기록합니다.",
    sources: [CDC_TBI],
  },
];

const recommendedEmergencyAction =
  "진단하지 말고 즉시 보호자 확인을 요청하며, 응급 상황으로 의심되면 119 또는 현지 응급번호 이용을 안내합니다.";

export function detectEvidenceBasedRisks(transcript: TranscriptTurn[]): EvidenceRiskMatch[] {
  const matches: EvidenceRiskMatch[] = [];

  transcript.forEach((turn, index) => {
    if (turn.role !== "user") return;
    const rawText = turn.text.trim();
    if (!rawText) return;

    for (const rule of immediateUrgentRules) {
      const found = rawText.match(rule.pattern);
      if (!found) continue;
      matches.push({
        category: rule.category,
        severity: "urgent",
        rawText,
        matchedTerms: [found[0] || rule.matchedLabel],
        rationale: rule.rationale,
        recommendedAction: recommendedEmergencyAction,
        sources: rule.sources,
        turnIndex: index,
      });
    }

    const shockTerms = shockSymptomRules
      .filter((rule) => rule.pattern.test(rawText))
      .map((rule) => rule.label);

    if (shockTerms.length >= 2) {
      matches.push({
        category: "shock_symptom_cluster",
        severity: "urgent",
        rawText,
        matchedTerms: shockTerms,
        rationale: "쇼크 출처에서 제시한 증상 중 2개 이상이 같은 답변에서 확인되어 쇼크 가능성을 배제하지 않고 긴급으로 기록합니다.",
        recommendedAction: recommendedEmergencyAction,
        sources: [MAYO_SHOCK],
        turnIndex: index,
      });
    } else if (shockTerms.length === 1) {
      matches.push({
        category: "single_shock_related_symptom",
        severity: "caution",
        rawText,
        matchedTerms: shockTerms,
        rationale: "쇼크 출처에서 제시한 증상 중 1개가 확인되었습니다. 단독 표현만으로 쇼크를 단정하지 않고 주의 신호로 기록합니다.",
        recommendedAction: "다음 질문에서 원인, 지속 시간, 동반 증상을 확인하고 보호자 확인 필요 여부를 판단합니다.",
        sources: [MAYO_SHOCK],
        turnIndex: index,
      });
    }
  });

  return dedupeRiskMatches(matches);
}

export function hasUrgentEvidenceRisk(matches: EvidenceRiskMatch[]): boolean {
  return matches.some((m) => m.severity === "urgent");
}

export function formatRiskEvidenceForReport(matches: EvidenceRiskMatch[]): string {
  if (matches.length === 0) return "";
  return matches
    .map((m, index) => {
      const sources = m.sources.map((s) => `${s.name} (${s.url})`).join("; ");
      return [
        `${index + 1}. [${m.severity === "urgent" ? "긴급" : "주의"}] ${m.category}`,
        `- 원문: ${m.rawText}`,
        `- 근거 표현: ${m.matchedTerms.join(", ")}`,
        `- 판단 근거: ${m.rationale}`,
        `- 권장 대응: ${m.recommendedAction}`,
        `- 출처: ${sources}`,
      ].join("\n");
    })
    .join("\n\n");
}

function dedupeRiskMatches(matches: EvidenceRiskMatch[]): EvidenceRiskMatch[] {
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = `${m.category}:${m.turnIndex}:${m.rawText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
