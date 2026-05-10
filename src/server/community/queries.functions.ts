import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import {
  ALL_SLUGS,
  type CategorySlug,
  type Post,
  type Comment,
  timeAgo,
} from "@/lib/community/types";

function getServerClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ProfileLite = {
  id: string;
  nickname: string;
  birth_year: number | null;
  region_sido: string | null;
  region_sigungu: string | null;
  verified: boolean;
};

function mapAuthor(p: ProfileLite | null | undefined, fallbackId: string) {
  if (!p) {
    return {
      id: fallbackId,
      handle: "익명",
      age: 0,
      sido: "",
      sigungu: "",
      verified: false,
    };
  }
  const age = p.birth_year ? new Date().getFullYear() - p.birth_year : 0;
  return {
    id: p.id,
    handle: p.nickname,
    age,
    sido: p.region_sido ?? "",
    sigungu: p.region_sigungu ?? "",
    verified: p.verified,
  };
}

export const listCategoryCounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, number>> => {
    const supabase = getServerClient();
    const { data: posts } = await supabase
      .from("community_posts")
      .select("category_slug");
    const counts: Record<string, number> = {};
    for (const s of ALL_SLUGS) counts[s] = 0;
    for (const p of posts ?? []) counts[p.category_slug] = (counts[p.category_slug] ?? 0) + 1;
    return counts;
  },
);

const ListPostsInput = z.object({
  category: z.enum(ALL_SLUGS as [CategorySlug, ...CategorySlug[]]).optional(),
});

export const listPosts = createServerFn({ method: "GET" })
  .inputValidator((d: { category?: CategorySlug } | undefined) =>
    ListPostsInput.parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<Post[]> => {
    const supabase = getServerClient();
    let q = supabase
      .from("community_posts")
      .select("id, category_slug, title, body, pinned, views, created_at, author_id, region_sido, region_sigungu, ai_generated")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.category) q = q.eq("category_slug", data.category);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const authorIds = Array.from(new Set((rows ?? []).map((r) => r.author_id)));
    const postIds = (rows ?? []).map((r) => r.id);

    const [{ data: profiles }, { data: botAuthors }, { data: likes }, { data: comments }] =
      await Promise.all([
        authorIds.length
          ? supabase
              .from("profiles")
              .select("id, nickname, birth_year, region_sido, region_sigungu, verified")
              .in("id", authorIds)
          : Promise.resolve({ data: [] as ProfileLite[] }),
        authorIds.length
          ? supabase
              .from("community_bot_authors")
              .select("id, nickname, birth_year, region_sido, region_sigungu, verified")
              .in("id", authorIds)
          : Promise.resolve({ data: [] as ProfileLite[] }),
        postIds.length
          ? supabase
              .from("community_post_likes")
              .select("post_id")
              .in("post_id", postIds)
          : Promise.resolve({ data: [] as { post_id: string }[] }),
        postIds.length
          ? supabase
              .from("community_comments")
              .select("post_id")
              .in("post_id", postIds)
          : Promise.resolve({ data: [] as { post_id: string }[] }),
      ]);

    const profileMap = new Map<string, ProfileLite>(
      (profiles ?? []).map((p) => [p.id, p as ProfileLite]),
    );
    for (const b of botAuthors ?? []) profileMap.set(b.id, b as ProfileLite);
    const likeCount = new Map<string, number>();
    for (const l of likes ?? []) likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1);
    const commentCount = new Map<string, number>();
    for (const c of comments ?? []) commentCount.set(c.post_id, (commentCount.get(c.post_id) ?? 0) + 1);

    return (rows ?? []).map((r) => ({
      id: r.id,
      category: r.category_slug as CategorySlug,
      title: r.title,
      body: r.body,
      pinned: r.pinned,
      views: r.views,
      author: mapAuthor(profileMap.get(r.author_id), r.author_id),
      createdAgo: timeAgo(r.created_at),
      likes: likeCount.get(r.id) ?? 0,
      comments: commentCount.get(r.id) ?? 0,
      region_sido: (r as any).region_sido ?? null,
      region_sigungu: (r as any).region_sigungu ?? null,
      ai_generated: (r as any).ai_generated ?? false,
    }));
  });

export const getPost = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ post: Post; comments: Comment[] } | null> => {
    const supabase = getServerClient();
    const { data: row } = await supabase
      .from("community_posts")
      .select("id, category_slug, title, body, pinned, views, created_at, author_id, region_sido, region_sigungu, ai_generated")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return null;

    const [{ data: profile }, { data: botProfile }, { data: likes }, { data: cmts }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, nickname, birth_year, region_sido, region_sigungu, verified")
        .eq("id", row.author_id)
        .maybeSingle(),
      supabase
        .from("community_bot_authors")
        .select("id, nickname, birth_year, region_sido, region_sigungu, verified")
        .eq("id", row.author_id)
        .maybeSingle(),
      supabase.from("community_post_likes").select("user_id").eq("post_id", row.id),
      supabase
        .from("community_comments")
        .select("id, post_id, body, created_at, author_id, ai_generated")
        .eq("post_id", row.id)
        .order("ai_generated", { ascending: false })
        .order("created_at", { ascending: true }),
    ]);

    const cmtAuthorIds = Array.from(new Set((cmts ?? []).map((c) => c.author_id)));
    const [{ data: cmtProfiles }, { data: cmtBots }] = cmtAuthorIds.length
      ? await Promise.all([
          supabase
            .from("profiles")
            .select("id, nickname, birth_year, region_sido, region_sigungu, verified")
            .in("id", cmtAuthorIds),
          supabase
            .from("community_bot_authors")
            .select("id, nickname, birth_year, region_sido, region_sigungu, verified")
            .in("id", cmtAuthorIds),
        ])
      : [{ data: [] as ProfileLite[] }, { data: [] as ProfileLite[] }];
    const cmtProfileMap = new Map<string, ProfileLite>(
      (cmtProfiles ?? []).map((p) => [p.id, p as ProfileLite]),
    );
    for (const b of cmtBots ?? []) cmtProfileMap.set(b.id, b as ProfileLite);

    const post: Post = {
      id: row.id,
      category: row.category_slug as CategorySlug,
      title: row.title,
      body: row.body,
      pinned: row.pinned,
      views: row.views,
      author: mapAuthor((profile ?? botProfile) as ProfileLite | null, row.author_id),
      createdAgo: timeAgo(row.created_at),
      likes: likes?.length ?? 0,
      comments: cmts?.length ?? 0,
      region_sido: (row as any).region_sido ?? null,
      region_sigungu: (row as any).region_sigungu ?? null,
      ai_generated: (row as any).ai_generated ?? false,
    };

    const comments: Comment[] = (cmts ?? []).map((c) => ({
      id: c.id,
      postId: c.post_id,
      body: c.body,
      author: mapAuthor(cmtProfileMap.get(c.author_id), c.author_id),
      createdAgo: timeAgo(c.created_at),
      likes: 0,
      ai_generated: (c as any).ai_generated ?? false,
    }));

    return { post, comments };
  });

// 같은 자치구의 다른 인기글
export const listSameDistrictPosts = createServerFn({ method: "GET" })
  .inputValidator((d: { sigungu: string; excludePostId?: string }) =>
    z.object({
      sigungu: z.string().trim().min(1).max(40),
      excludePostId: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<Array<{ id: string; title: string; createdAgo: string }>> => {
    const supabase = getServerClient();
    let q = supabase
      .from("community_posts")
      .select("id, title, created_at")
      .eq("region_sigungu", data.sigungu)
      .order("views", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6);
    const { data: rows } = await q;
    return (rows ?? [])
      .filter((r) => r.id !== data.excludePostId)
      .slice(0, 5)
      .map((r) => ({ id: r.id, title: r.title, createdAgo: timeAgo(r.created_at) }));
  });
