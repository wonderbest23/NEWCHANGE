// Admin CRUD + Lovable AI draft generation for tips.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TIP_CATEGORY_SLUGS } from "./types";
import { embedText } from "@/server/ingest/embeddings.server";

async function buildTipEmbedText(t: {
  title: string;
  summary: string;
  tags?: string[] | null;
  steps?: Array<{ text?: string; tip?: string | null }> | null;
}): Promise<string> {
  const stepText = (t.steps ?? [])
    .map((s) => [s.text, s.tip].filter(Boolean).join(" "))
    .join("\n");
  return [t.title, t.summary, (t.tags ?? []).join(", "), stepText]
    .filter(Boolean)
    .join("\n");
}

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("관리자 권한이 필요합니다.");
}

const StepSchema = z.object({
  order: z.number().int().min(1),
  text: z.string().min(1).max(400),
  image_url: z.string().nullable().optional(),
  tip: z.string().nullable().optional(),
});

const TipInput = z.object({
  id: z.string().uuid().optional(),
  category_slug: z.enum(TIP_CATEGORY_SLUGS as [string, ...string[]]),
  title: z.string().min(2).max(120),
  summary: z.string().min(2).max(280),
  cover_image_url: z.string().url().nullable().optional().or(z.literal("")),
  steps: z.array(StepSchema).min(1).max(15),
  tags: z.array(z.string().max(40)).max(10).optional(),
  is_published: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

export const adminListTips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("tips")
      .select(
        "id, category_slug, title, summary, is_published, pinned, like_count, views, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertTip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TipInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const now = new Date().toISOString();
    const payload = {
      category_slug: data.category_slug,
      title: data.title,
      summary: data.summary,
      cover_image_url: data.cover_image_url || null,
      steps: data.steps,
      tags: data.tags ?? [],
      is_published: data.is_published ?? false,
      pinned: data.pinned ?? false,
      published_at: data.is_published ? now : null,
      created_by: context.userId,
    };
    if (data.id) {
      // 게시 중인 글이면 published_at 보존
      const { data: existing } = await supabaseAdmin
        .from("tips")
        .select("published_at, is_published")
        .eq("id", data.id)
        .maybeSingle();
      const published_at =
        data.is_published
          ? existing?.published_at ?? now
          : null;
      const { data: row, error } = await supabaseAdmin
        .from("tips")
        .update({ ...payload, published_at })
        .eq("id", data.id)
        .select()
        .maybeSingle();
      if (error) throw new Error(error.message);
      // 업데이트 시에도 임베딩 갱신 (best-effort)
      try {
        const embedSource = await buildTipEmbedText(data);
        const vec = await embedText(embedSource);
        if (vec) {
          await supabaseAdmin
            .from("tips")
            .update({ embedding: vec as unknown as string })
            .eq("id", data.id);
        }
      } catch (e) {
        console.warn("[upsertTip:update] embedding failed", e);
      }
      return { tip: row };
    }
    const { data: row, error } = await supabaseAdmin
      .from("tips")
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);

    // 임베딩은 best-effort: 실패해도 저장은 성공으로 처리
    try {
      const embedSource = await buildTipEmbedText(data);
      const vec = await embedText(embedSource);
      if (vec && row?.id) {
        await supabaseAdmin
          .from("tips")
          .update({ embedding: vec as unknown as string })
          .eq("id", row.id);
      }
    } catch (e) {
      console.warn("[upsertTip] embedding failed", e);
    }

    return { tip: row };
  });

// ─────────────────────────────────────────────
// 임베딩이 없는 발행 꿀팁을 일괄 채워주는 관리자용 함수
export const backfillTipEmbeddings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("tips")
      .select("id, title, summary, tags, steps")
      .is("embedding", null)
      .limit(50);
    if (error) throw new Error(error.message);
    let ok = 0;
    let failed = 0;
    for (const r of rows ?? []) {
      try {
        const txt = await buildTipEmbedText(r as any);
        const vec = await embedText(txt);
        if (!vec) {
          failed += 1;
          continue;
        }
        const { error: upErr } = await supabaseAdmin
          .from("tips")
          .update({ embedding: vec as unknown as string })
          .eq("id", r.id);
        if (upErr) failed += 1;
        else ok += 1;
      } catch {
        failed += 1;
      }
    }
    return { ok, failed, scanned: rows?.length ?? 0 };
  });

export const deleteTip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("tips")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DraftInput = z.object({
  category_slug: z.enum(TIP_CATEGORY_SLUGS as [string, ...string[]]),
  topic: z.string().min(2).max(160),
});

interface DraftResult {
  title: string;
  summary: string;
  steps: { order: number; text: string; tip?: string }[];
  tags: string[];
}

export const generateTipDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DraftInput.parse(d))
  .handler(async ({ data, context }): Promise<DraftResult> => {
    await assertAdmin(context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI 게이트웨이 키가 설정되지 않았습니다.");

    const categoryLabel: Record<string, string> = {
      kiosk: "키오스크 사용법",
      travel: "여행·예매(KTX/항공/숙소)",
      ai: "AI·스마트폰 활용",
      public: "병원·관공서·금융 절차",
    };

    const system = `당신은 한국 시니어를 위한 생활 가이드 작가입니다.
원칙:
- 65세 이상 어르신이 혼자 따라할 수 있도록 매우 쉬운 말로 씁니다.
- 한 단계는 한 가지 행동만. 16~50자 사이.
- 어려운 영어/외래어는 풀어쓰거나 한국어 병기.
- 4~7단계로 정리.
- 각 단계에 필요한 경우 "주의/꿀팁" 한 줄을 추가.
- 진단·법률 자문 금지. 약·돈 관련은 "직원에게 도움 요청" 같은 안전 문구.`;

    const userMsg = `카테고리: ${categoryLabel[data.category_slug]}
주제: ${data.topic}

위 주제의 단계별 가이드를 JSON 함수로 작성하세요.`;

    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "write_tip",
                description: "Senior-friendly step-by-step guide.",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "30자 이내 제목" },
                    summary: {
                      type: "string",
                      description: "이 꿀팁을 한 문장 요약 (60자 이내)",
                    },
                    steps: {
                      type: "array",
                      minItems: 4,
                      maxItems: 7,
                      items: {
                        type: "object",
                        properties: {
                          order: { type: "integer", minimum: 1 },
                          text: { type: "string" },
                          tip: { type: "string" },
                        },
                        required: ["order", "text"],
                        additionalProperties: false,
                      },
                    },
                    tags: {
                      type: "array",
                      items: { type: "string" },
                      maxItems: 5,
                    },
                  },
                  required: ["title", "summary", "steps", "tags"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "write_tip" },
          },
        }),
      },
    );

    if (resp.status === 429) {
      throw new Error(
        "AI 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
      );
    }
    if (resp.status === 402) {
      throw new Error("AI 사용량이 모두 소진되었습니다. 크레딧을 충전해주세요.");
    }
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`AI 호출 실패: ${t.slice(0, 200)}`);
    }

    const j = await resp.json();
    const call = j?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = call?.function?.arguments;
    if (!argsRaw) throw new Error("AI가 응답을 만들지 못했습니다.");
    const parsed = JSON.parse(argsRaw) as DraftResult;
    // sanitize
    parsed.steps = (parsed.steps ?? [])
      .slice(0, 10)
      .map((s, i) => ({
        order: i + 1,
        text: String(s.text ?? "").slice(0, 200),
        tip: s.tip ? String(s.tip).slice(0, 160) : undefined,
      }));
    parsed.tags = (parsed.tags ?? []).slice(0, 5).map((t) => String(t).slice(0, 30));
    return parsed;
  });
