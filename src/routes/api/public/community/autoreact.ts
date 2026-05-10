import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const Route = createFileRoute("/api/public/community/autoreact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        // 최근 48시간 글
        const since = new Date(Date.now() - 48 * 3600_000).toISOString();
        const { data: posts } = await supabaseAdmin
          .from("community_posts")
          .select("id, views, created_at")
          .gte("created_at", since)
          .limit(80);
        if (!posts || posts.length === 0) return Response.json({ skipped: true });

        const { data: bots } = await supabaseAdmin
          .from("community_bot_authors")
          .select("id");
        if (!bots || bots.length === 0) return Response.json({ skipped: true });

        // 3~6개 글 골라서 조회수 +1~5, 일부에는 좋아요 +1 (봇 user_id로는 못 넣으니 views만)
        const targets = posts.sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 4) + 3);

        let updated = 0;
        for (const p of targets) {
          const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 3600_000;
          // 새 글일수록 더 많이 증가
          const recencyBoost = ageHours < 6 ? 4 : ageHours < 24 ? 2 : 1;
          const inc = Math.floor(Math.random() * 3 * recencyBoost) + 1;
          await supabaseAdmin
            .from("community_posts")
            .update({ views: (p.views ?? 0) + inc })
            .eq("id", p.id);
          updated++;
        }

        return Response.json({ updated });
      },
    },
  },
});
