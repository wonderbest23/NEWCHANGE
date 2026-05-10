import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const Route = createFileRoute("/api/public/community/autocomment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        // 최근 36시간 내 글 중 댓글 0~2개 인 글 후보
        const since = new Date(Date.now() - 36 * 3600_000).toISOString();
        const { data: posts } = await supabaseAdmin
          .from("community_posts")
          .select("id, title, body, category_slug, author_id, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(40);

        if (!posts || posts.length === 0) {
          return Response.json({ skipped: true });
        }

        // 각 글의 현재 댓글 수 조회
        const postIds = posts.map((p) => p.id);
        const { data: existing } = await supabaseAdmin
          .from("community_comments")
          .select("post_id")
          .in("post_id", postIds);
        const counts = new Map<string, number>();
        for (const c of existing ?? []) counts.set(c.post_id, (counts.get(c.post_id) ?? 0) + 1);

        const candidates = posts.filter((p) => (counts.get(p.id) ?? 0) < 3);
        if (candidates.length === 0) return Response.json({ skipped: true });

        const target = pick(candidates);

        const { data: bots } = await supabaseAdmin
          .from("community_bot_authors")
          .select("id, nickname");
        if (!bots || bots.length === 0) {
          return new Response("No bot authors", { status: 500 });
        }
        const author = pick(bots.filter((b) => b.id !== target.author_id) || bots);

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const sys = `당신은 한국의 60~75세 시니어 커뮤니티 회원입니다. 다른 회원의 글에 짧고 따뜻한 댓글을 답니다.
규칙:
- 1~3문장. 자연스럽고 진심 어리게.
- 본인 비슷한 경험 살짝 언급하거나, 공감/응원/짧은 질문 중 하나.
- 너무 매끄럽지 않게. 이모지 거의 없음.
- 본문 그대로 인용하지 말 것. 단정짓지 말 것.
- 출력은 댓글 본문만. 따옴표/머리말 없이.`;

        const usr = `[원글 카테고리] ${target.category_slug}\n[원글 제목] ${target.title}\n[원글 본문]\n${target.body.slice(0, 600)}\n\n위 글에 댓글을 달아주세요.`;

        try {
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: Math.random() < 0.6 ? "google/gemini-2.5-flash-lite" : "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: sys },
                { role: "user", content: usr },
              ],
            }),
          });
          if (!resp.ok) {
            return Response.json({ error: "ai_failed", status: resp.status }, { status: 500 });
          }
          const data = await resp.json();
          const body: string = (data?.choices?.[0]?.message?.content ?? "").trim();
          if (!body) return Response.json({ skipped: true });

          // 글 작성 시점 이후 ~ 지금 사이 랜덤 시각
          const postCreated = new Date(target.created_at).getTime();
          const now = Date.now();
          const cmtAt = new Date(
            postCreated + Math.random() * Math.max(60_000, now - postCreated),
          ).toISOString();

          await supabaseAdmin.from("community_comments").insert({
            post_id: target.id,
            author_id: author.id,
            body: body.slice(0, 1500),
            ai_generated: true,
            created_at: cmtAt,
          });

          return Response.json({ ok: true, post_id: target.id });
        } catch (e) {
          console.error("autocomment error", e);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
