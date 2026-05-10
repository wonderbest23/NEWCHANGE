import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { COMMUNITY_BOT_AUTHOR_ID } from "@/lib/regions";

// 동네지킴이 AI 첫 댓글을 생성해 community_comments에 ai_generated=true로 저장한다.
// - 일반 회원으로 위장하지 않는다 (봇 author 사용 + ai_generated 플래그)
// - 의료 진단 금지, 따뜻한 공감 + 안전한 안내 + 가능한 경우 지역 정보 1개 연결
export const generatePostFeedback = createServerFn({ method: "POST" })
  .inputValidator((d: { postId: string }) =>
    z.object({ postId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      console.error("[generatePostFeedback] LOVABLE_API_KEY missing");
      return { ok: false, reason: "no_api_key" as const };
    }

    // 1) 글 로드
    const { data: post, error: postErr } = await supabaseAdmin
      .from("community_posts")
      .select("id, title, body, category_slug, region_sigungu, region_sido")
      .eq("id", data.postId)
      .maybeSingle();
    if (postErr || !post) {
      console.error("[generatePostFeedback] post not found", postErr);
      return { ok: false, reason: "not_found" as const };
    }

    // 2) 중복 방지: 이미 봇 댓글이 있으면 스킵
    const { data: existing } = await supabaseAdmin
      .from("community_comments")
      .select("id")
      .eq("post_id", post.id)
      .eq("author_id", COMMUNITY_BOT_AUTHOR_ID)
      .maybeSingle();
    if (existing) return { ok: true, skipped: true as const };

    // 3) 같은 자치구의 추천 자원 1개 (있으면)
    let related: { name: string; description: string | null } | null = null;
    if (post.region_sigungu) {
      const { data: res } = await supabaseAdmin
        .from("local_resources")
        .select("name, description")
        .eq("is_active", true)
        .eq("region_sigungu", post.region_sigungu)
        .limit(1);
      related = res?.[0] ?? null;
    }

    // 4) AI 댓글 생성 (Lovable AI Gateway)
    const system = `당신은 한국 시니어 커뮤니티 "곁"의 운영 도우미 "동네지킴이 AI"입니다.
원칙:
- 일반 회원인 척하지 마세요. 항상 운영 도우미로서 말합니다.
- 의료 진단을 하지 마세요. 병명/위험도 퍼센트를 말하지 마세요.
- 자극적 표현 금지. 따뜻하고 짧게.
- 2~4문장. 마지막에 부드러운 질문 1개.
- 관련 지역 정보가 주어지면 자연스럽게 한 줄로만 연결하세요.`;

    const userMsg =
      `[글 제목]\n${post.title}\n\n[글 본문]\n${post.body}\n\n` +
      (related
        ? `[연결 가능한 우리 동네 정보]\n- ${related.name}${related.description ? `: ${related.description.slice(0, 120)}` : ""}\n\n`
        : "") +
      `위 글에 동네지킴이 AI로서 따뜻한 첫 댓글을 작성하세요.`;

    let aiText = "";
    try {
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
          }),
        },
      );
      if (!resp.ok) {
        console.error("[generatePostFeedback] gateway", resp.status, await resp.text());
        return { ok: false, reason: "gateway_error" as const };
      }
      const j = await resp.json();
      aiText = (j?.choices?.[0]?.message?.content ?? "").trim();
    } catch (e) {
      console.error("[generatePostFeedback] fetch fail", e);
      return { ok: false, reason: "gateway_fail" as const };
    }

    if (!aiText) return { ok: false, reason: "empty" as const };

    // 5) 댓글 저장 (봇 author + ai_generated=true)
    const { error: insErr } = await supabaseAdmin.from("community_comments").insert({
      post_id: post.id,
      author_id: COMMUNITY_BOT_AUTHOR_ID,
      body: aiText,
      ai_generated: true,
    });
    if (insErr) {
      console.error("[generatePostFeedback] insert", insErr);
      return { ok: false, reason: "insert_error" as const };
    }
    return { ok: true, skipped: false as const };
  });
