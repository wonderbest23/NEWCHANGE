/**
 * 감정 기반 일별 맞춤 추천 — OpenAI 생성 + Supabase 글로벌 캐시.
 *
 * 흐름:
 *  1. KST 기준 오늘 날짜 + 감정 키로 캐시 조회
 *  2. 적중 시 즉시 반환
 *  3. 미적중 시 OpenAI 호출 → tool calling 으로 정형 JSON 응답
 *  4. emotion_rec_cache 에 upsert → 같은 날 다른 사용자에게도 동일 콘텐츠 제공
 *  5. AI 실패 시 정적 백업 풀(emotion.ts)을 그대로 반환
 *
 * 비용 통제:
 *  - 캐시 키 = 글로벌(per-user 아님). 하루 6감정 × 1회 호출 = 최대 6회/일
 *  - 한 호출당 ~600 토큰 (gpt-4o-mini 기준 약 0.0001달러) — 무시할 수준
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getDailyMixedRecommendations,
  type EmotionKey,
  type EmotionRecommendation,
  type RecKind,
} from "./emotion";

const InputSchema = z.object({
  emotionKey: z.enum(["joyful", "calm", "sad", "tired", "alert", "anxious"]),
});

/** KST 기준 오늘 날짜 (YYYY-MM-DD) */
function kstDateKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/** 감정별 시니어 친화 톤 + AI에게 줄 가이드 */
const EMOTION_GUIDE: Record<EmotionKey, string> = {
  joyful: "어르신이 밝고 즐거운 상태입니다. 긍정 정서를 더 오래 지속시키는 콘텐츠 — 감사, 사회적 연결, 새로운 도전 등 — 을 추천해 주세요.",
  calm: "어르신이 평온한 상태입니다. 이 상태를 유지·심화시키는 콘텐츠 — 호흡, 마음챙김, 자연 — 을 추천해 주세요.",
  sad: "어르신이 슬프고 가라앉아 있습니다. 따뜻한 위로와 회복을 돕는 콘텐츠 — 자기자비, 햇살, 감정 공유 — 를 추천해 주세요. 단, 의료 진단이나 약 변경 권유는 절대 하지 마세요.",
  tired: "어르신이 지쳐 있습니다. 무리하지 않고 회복할 수 있는 콘텐츠 — 짧은 휴식, 수면 위생, 가벼운 활동 — 을 추천해 주세요.",
  alert: "어르신이 긴장·분노 상태입니다. 빠르게 진정시키는 콘텐츠 — 호흡, 신체 활동, 인지 재평가 — 를 추천해 주세요.",
  anxious: "어르신이 불안한 상태입니다. 안전감을 회복시키는 콘텐츠 — 그라운딩, 긴 날숨 호흡, 작은 실천 — 을 추천해 주세요.",
};

const SYSTEM_PROMPT = `당신은 60대 이상 어르신의 마음 건강을 돕는 큐레이터입니다.

규칙:
- 한국어 존댓말, 부드럽고 따뜻한 어투.
- 의료 진단·약 처방·치료법은 절대 직접 제안하지 않음.
- 외래어는 풀어 설명 (예: "그라운딩" → "지금 이 순간에 머물기").
- 어르신이 직접 따라할 수 있는 구체적인 콘텐츠.
- 매일 새로운 콘텐츠를 보여드리기 위해 잘 알려진 것뿐 아니라 덜 알려진 보석 같은 작품·문장도 포함.
- 한국 문학(예: 한강, 박완서, 김훈, 이해인 수녀), 동서양 고전, 현대 명상 가이드 모두 활용 가능.
- 각 추천은 출처가 명확해야 함 (책 제목 + 저자, 명언 + 화자, 장소 + 정확한 위치).

반환은 반드시 4개의 추천이며, 각각 다음 종류 중 서로 다른 종류여야 합니다:
- "action" (즉시 해볼 수 있는 작은 행동)
- "meditation" (호흡·명상 가이드, 시간 명시)
- "quote" (한국 문학·동서양 고전·시인의 인용문)
- "book" (시니어가 읽기 좋은 책 1권 + 저자 + 한 줄 의미)
- "place" (서울 시민이 무료/저렴하게 갈 수 있는 장소 + 정확한 위치)
- "music" (편안하게 들을 수 있는 곡·음악가)`;

const RecSchema = z.object({
  kind: z.enum(["action", "meditation", "quote", "book", "place", "music", "content"]),
  priority: z.enum(["now", "soon", "keep"]),
  cadence: z.enum(["daily", "weekly", "monthly"]).optional().default("daily"),
  text: z.string().min(1).max(300),
  hint: z.string().max(300).optional(),
  author: z.string().max(100).optional(),
});

const ResponseSchema = z.object({
  items: z.array(RecSchema).min(3).max(6),
});

async function callOpenAI(emotionKey: EmotionKey, dateKey: string): Promise<EmotionRecommendation[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[emotion-rec] OPENAI_API_KEY missing — falling back to static");
    return null;
  }

  const body = {
    model: "gpt-4o-mini",
    temperature: 0.85, // 매일 다양성 확보 — 같은 날엔 캐시되므로 호출은 1회뿐
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: `오늘 날짜는 ${dateKey} 입니다. 어르신의 오늘 감정 상태와 가이드:\n\n${EMOTION_GUIDE[emotionKey]}\n\n위 가이드에 맞춰 어르신께 드릴 4개의 다양한 종류 추천을 만들어 주세요. 종류는 모두 서로 달라야 하고, 출처(저자/장소/화자)는 정확해야 합니다.`,
      },
    ],
    tools: [
      {
        type: "function" as const,
        function: {
          name: "submit_recommendations",
          description: "감정 기반 일별 맞춤 추천 4개",
          parameters: {
            type: "object",
            properties: {
              items: {
                type: "array",
                minItems: 3,
                maxItems: 6,
                items: {
                  type: "object",
                  properties: {
                    kind: {
                      type: "string",
                      enum: ["action", "meditation", "quote", "book", "place", "music", "content"],
                      description: "추천 종류 (서로 다른 종류로)",
                    },
                    priority: {
                      type: "string",
                      enum: ["now", "soon", "keep"],
                      description: "now=지금 바로, soon=오늘 안에, keep=평소 유지",
                    },
                    cadence: {
                      type: "string",
                      enum: ["daily", "weekly", "monthly"],
                      description: "권고 주기",
                    },
                    text: {
                      type: "string",
                      description: "본문 — 책 제목/명언 본문/행동 권고/장소명 등 (최대 300자)",
                    },
                    hint: {
                      type: "string",
                      description: "한 줄 보충 — 의미·방법·소개 (최대 300자)",
                    },
                    author: {
                      type: "string",
                      description: "저자/화자/장소 위치 등 출처 메타",
                    },
                  },
                  required: ["kind", "priority", "text"],
                  additionalProperties: false,
                },
              },
            },
            required: ["items"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function" as const, function: { name: "submit_recommendations" } },
  };

  try {
    const { OPENAI_BASE_URL } = await import("@/lib/ai/openai-base");
    const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[emotion-rec] openai", res.status, t.slice(0, 300));
      return null;
    }
    const json = await res.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      console.warn("[emotion-rec] no tool_call in response");
      return null;
    }
    const parsed = ResponseSchema.parse(JSON.parse(args));
    return parsed.items.map((it) => ({
      priority: it.priority,
      cadence: it.cadence ?? "daily",
      kind: it.kind as RecKind,
      text: it.text,
      hint: it.hint,
      author: it.author,
    }));
  } catch (e) {
    console.error("[emotion-rec] openai failed", e);
    return null;
  }
}

export const getDailyEmotionRecommendations = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<{ items: EmotionRecommendation[]; source: "cache" | "ai" | "fallback" }> => {
    const dateKey = kstDateKey();
    const cacheKey = `${dateKey}:${data.emotionKey}`;

    // 1) 캐시 조회 — 테이블이 자동 생성 타입에 없으므로 any 우회
    try {
      const sb = supabaseAdmin as any;
      const { data: cached } = await sb
        .from("emotion_rec_cache")
        .select("items")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      const items = cached?.items;
      if (Array.isArray(items) && items.length > 0) {
        return { items: items as EmotionRecommendation[], source: "cache" };
      }
    } catch (e) {
      console.warn("[emotion-rec] cache lookup failed", e);
    }

    // 2) AI 호출
    const aiItems = await callOpenAI(data.emotionKey as EmotionKey, dateKey);
    if (aiItems && aiItems.length > 0) {
      // 3) 캐시 upsert — 타입 우회
      try {
        const sb = supabaseAdmin as any;
        await sb
          .from("emotion_rec_cache")
          .upsert({ cache_key: cacheKey, items: aiItems }, { onConflict: "cache_key" });
      } catch (e) {
        console.warn("[emotion-rec] cache write failed", e);
      }
      return { items: aiItems, source: "ai" };
    }

    // 4) 최종 백업 — 정적 풀
    return {
      items: getDailyMixedRecommendations(data.emotionKey as EmotionKey, 4),
      source: "fallback",
    };
  });
