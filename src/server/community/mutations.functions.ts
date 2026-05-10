import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ALL_SLUGS, type CategorySlug } from "@/lib/community/types";
import { generatePostFeedback } from "./feedback.functions";

export const createPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    category: CategorySlug;
    title: string;
    body: string;
    region_sido?: string | null;
    region_sigungu?: string | null;
  }) =>
    z
      .object({
        category: z.enum(ALL_SLUGS as [CategorySlug, ...CategorySlug[]]),
        title: z.string().trim().min(2).max(120),
        body: z.string().trim().min(2).max(10000),
        region_sido: z.string().trim().max(40).optional().nullable(),
        region_sigungu: z.string().trim().max(40).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;

    // region이 명시되지 않으면 본인 프로필에서 폴백
    let sido = data.region_sido ?? null;
    let sigungu = data.region_sigungu ?? null;
    if (!sigungu) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("region_sido, region_sigungu")
        .eq("id", userId)
        .maybeSingle();
      sido = sido ?? prof?.region_sido ?? null;
      sigungu = sigungu ?? prof?.region_sigungu ?? null;
    }

    const { data: row, error } = await supabase
      .from("community_posts")
      .insert({
        category_slug: data.category,
        title: data.title,
        body: data.body,
        author_id: userId,
        region_sido: sido,
        region_sigungu: sigungu,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // AI 첫 댓글은 백그라운드로 (응답 지연 방지). 실패해도 글 작성은 성공.
    generatePostFeedback({ data: { postId: row.id } }).catch((e) =>
      console.error("[createPost] feedback failed", e),
    );

    return { id: row.id };
  });

export const createComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { postId: string; body: string }) =>
    z
      .object({
        postId: z.string().uuid(),
        body: z.string().trim().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("community_comments").insert({
      post_id: data.postId,
      author_id: userId,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const togglePostLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { postId: string }) =>
    z.object({ postId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("community_post_likes")
      .select("post_id")
      .eq("post_id", data.postId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("community_post_likes")
        .delete()
        .eq("post_id", data.postId)
        .eq("user_id", userId);
      return { liked: false };
    }
    await supabase.from("community_post_likes").insert({
      post_id: data.postId,
      user_id: userId,
    });
    return { liked: true };
  });
