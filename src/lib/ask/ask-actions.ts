import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { embedText } from "@/lib/ai/embeddings";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const inputSchema = z.object({
  question: z.string().min(1).max(500),
  userId: z.string().uuid().nullish(),
});

export type RelatedTip = {
  id: string;
  category_slug: string;
  title: string;
  summary: string;
  cover_image_url: string | null;
  similarity: number;
};

export type RiskCategory = "medical" | "legal" | "finance" | null;

export type AskAnswer = {
  title: string;
  summary: string;
  steps: { title: string; detail: string }[];
  caution?: string | null;
  riskCategory: RiskCategory;
  expertGuidance?: {
    label: string;
    message: string;
    contacts: { name: string; phone?: string; note?: string }[];
  } | null;
  relatedTips: RelatedTip[];
};

const FALLBACK: AskAnswer = {
  title: "잠시 후 다시 시도해 주세요",
  summary: "지금은 답을 가져올 수 없어요. 잠시 후 다시 물어봐 주세요.",
  steps: [{ title: "다시 시도", detail: "마이크 버튼을 눌러 다시 한 번 천천히 말씀해 주세요." }],
  caution: null,
  riskCategory: null,
  expertGuidance: null,
  relatedTips: [],
};

// 위험 키워드 기반 사전 분류 (시니어 안전 우선)
const RISK_KEYWORDS: Record<Exclude<RiskCategory, null>, string[]> = {
  medical: ["증상", "통증", "아파", "아픔", "약", "복용", "진단", "병원", "의사", "수술", "혈압", "당뇨", "어지", "두통", "가슴", "처방", "응급"],
  legal: ["계약", "소송", "고소", "고발", "법", "변호사", "유언", "상속", "사기", "피해", "분쟁", "위임", "공증", "등기"],
  finance: ["송금", "이체", "투자", "주식", "코인", "비트코인", "대출", "보증", "보험금", "적금 해지", "펀드", "환전", "계좌이체", "수수료", "수익률"],
};

const EXPERT_GUIDANCE: Record<Exclude<RiskCategory, null>, AskAnswer["expertGuidance"]> = {
  medical: {
    label: "의료 상담 우선 안내",
    message: "건강과 약 복용은 직접 답변드리기보다 전문가와 먼저 상의하시는 것이 안전해요.",
    contacts: [
      { name: "응급의료상담 119", phone: "119", note: "긴급 증상" },
      { name: "건강 상담 1339", phone: "1339", note: "질병관리청 24시간" },
      { name: "단골 병원/주치의", note: "복용 중인 약과 함께 문의" },
    ],
  },
  legal: {
    label: "법률 상담 우선 안내",
    message: "법률 문제는 사건마다 결과가 달라, 변호사·공공 상담 창구에 먼저 확인하시는 게 안전해요.",
    contacts: [
      { name: "대한법률구조공단 132", phone: "132", note: "무료 법률 상담" },
      { name: "노인보호전문기관 1577-1389", phone: "1577-1389", note: "노인 권익 보호" },
      { name: "가족·자녀와 상의", note: "혼자 결정하지 마세요" },
    ],
  },
  finance: {
    label: "금융 거래 우선 안내",
    message: "송금·투자·대출은 보이스피싱 위험이 있어요. 절대 혼자 결정하지 마시고 가족·은행 창구에 먼저 확인해 주세요.",
    contacts: [
      { name: "보이스피싱 신고 112", phone: "112", note: "수상한 전화·문자" },
      { name: "금융감독원 1332", phone: "1332", note: "금융 사기·상담" },
      { name: "거래 은행 영업점", note: "창구 직원에게 직접 확인" },
    ],
  },
};

function detectRisk(question: string): RiskCategory {
  const q = question.toLowerCase();
  for (const [cat, words] of Object.entries(RISK_KEYWORDS)) {
    if (words.some((w) => q.includes(w))) return cat as RiskCategory;
  }
  return null;
}

async function findRelatedTips(question: string): Promise<RelatedTip[]> {
  try {
    const vec = await embedText(question);
    if (!vec) return [];
    const { data, error } = await supabaseAdmin.rpc("match_tips", {
      query_embedding: vec as unknown as string,
      match_count: 3,
      min_similarity: 0.3,
    });
    if (error) {
      console.warn("[askSenior] match_tips error", error.message);
      return [];
    }
    return (data ?? []) as RelatedTip[];
  } catch (e) {
    console.warn("[askSenior] findRelatedTips failed", e);
    return [];
  }
}

async function logAsk(params: {
  userId?: string | null;
  question: string;
  risk: RiskCategory;
  answer: AskAnswer;
}) {
  try {
    await supabaseAdmin.from("ask_logs").insert({
      user_id: params.userId ?? null,
      question: params.question,
      risk_category: params.risk,
      answer_title: params.answer.title,
      answer_summary: params.answer.summary,
      caution: params.answer.caution,
      related_tip_ids: params.answer.relatedTips.map((t) => t.id),
    });
  } catch (e) {
    console.warn("[askSenior] logAsk failed", e);
  }
}

const SYSTEM_PROMPT = `당신은 시니어(60대 이상) 어르신을 돕는 친절한 도우미입니다.
- 키오스크 사용, 병원·관공서·금융, AI·스마트폰, 여행·예매 등 일상 속 디지털·생활 질문에 답합니다.
- 반드시 한국어로, 존댓말로, 어려운 외래어를 풀어 설명합니다.
- 답변은 항상 짧은 단계(3~6개)로 나누고, 각 단계는 한 문장으로 명확하게 적습니다.
- 의료 진단·약 복용 변경·법률·금융 거래(송금/투자) 결정은 직접 조언하지 말고 "전문가나 가족과 상의" 안내를 caution에 적습니다.
- 모르는 것은 솔직히 모른다고 합니다.`;

export const askSenior = createServerFn({ method: "POST" })
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<AskAnswer> => {
    const risk = detectRisk(data.question);
    const expertGuidance = risk ? EXPERT_GUIDANCE[risk] : null;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OPENAI_API_KEY missing");
      const ans = { ...FALLBACK, riskCategory: risk, expertGuidance };
      await logAsk({ userId: data.userId, question: data.question, risk, answer: ans });
      return ans;
    }

    const relatedTipsPromise = findRelatedTips(data.question);

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: data.question },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "answer_for_senior",
                description: "시니어 어르신을 위한 단계별 답변",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "질문에 대한 짧은 제목 (15자 이내)" },
                    summary: { type: "string", description: "한두 문장 핵심 요약" },
                    steps: {
                      type: "array",
                      minItems: 2,
                      maxItems: 6,
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string", description: "단계 제목 (10자 내외)" },
                          detail: { type: "string", description: "한 문장 상세 설명" },
                        },
                        required: ["title", "detail"],
                        additionalProperties: false,
                      },
                    },
                    caution: {
                      type: "string",
                      description: "의료/금융/법률 등 주의가 필요한 경우의 안내. 없으면 빈 문자열.",
                    },
                  },
                  required: ["title", "summary", "steps", "caution"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "answer_for_senior" } },
        }),
      });

      const relatedTips = await relatedTipsPromise;

      if (!res.ok) {
        const body = await res.text();
        console.error("askSenior gateway error", res.status, body);
        let ans: AskAnswer = { ...FALLBACK, relatedTips, riskCategory: risk, expertGuidance };
        if (res.status === 429) ans = { ...ans, summary: "지금은 질문이 많아 잠시 쉬어가고 있어요. 1~2분 뒤 다시 물어봐 주세요." };
        if (res.status === 402) ans = { ...ans, summary: "AI 사용 한도가 다 되었어요. 관리자에게 알려 주세요." };
        await logAsk({ userId: data.userId, question: data.question, risk, answer: ans });
        return ans;
      }

      const json = await res.json();
      const call = json?.choices?.[0]?.message?.tool_calls?.[0];
      const args = call?.function?.arguments;
      if (!args) {
        const ans = { ...FALLBACK, relatedTips, riskCategory: risk, expertGuidance };
        await logAsk({ userId: data.userId, question: data.question, risk, answer: ans });
        return ans;
      }

      const parsed = JSON.parse(args) as Partial<AskAnswer>;
      const baseCaution = (parsed.caution ?? "").toString().trim() || null;
      const mergedCaution = expertGuidance
        ? [expertGuidance.message, baseCaution].filter(Boolean).join(" ")
        : baseCaution;

      const ans: AskAnswer = {
        title: parsed.title?.toString().trim() || "답변",
        summary: parsed.summary?.toString().trim() || "",
        steps: Array.isArray(parsed.steps) ? parsed.steps.slice(0, 6) : [],
        caution: mergedCaution,
        riskCategory: risk,
        expertGuidance,
        relatedTips,
      };
      await logAsk({ userId: data.userId, question: data.question, risk, answer: ans });
      return ans;
    } catch (err) {
      console.error("askSenior failed", err);
      const relatedTips = await relatedTipsPromise.catch(() => []);
      const ans = { ...FALLBACK, relatedTips, riskCategory: risk, expertGuidance };
      await logAsk({ userId: data.userId, question: data.question, risk, answer: ans });
      return ans;
    }
  });
