// Public read queries + like toggle + view increment for tips.
// Public reads use a service role-free anon-style client (publishable key) so
// they respect RLS (only published tips). Like/unlike require auth.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  TIP_CATEGORY_SLUGS,
  type TipCategorySlug,
  type TipDetail,
  type TipListItem,
  type TipStep,
} from "./types";

function getPublicClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function rowToList(row: {
  id: string;
  category_slug: string;
  title: string;
  summary: string;
  cover_image_url: string | null;
  tags: string[];
  pinned: boolean;
  views: number;
  like_count: number;
  steps: unknown;
  published_at: string | null;
}): TipListItem {
  const steps = Array.isArray(row.steps) ? (row.steps as unknown as TipStep[]) : [];
  return {
    id: row.id,
    category_slug: row.category_slug as TipCategorySlug,
    title: row.title,
    summary: row.summary,
    cover_image_url: row.cover_image_url,
    tags: row.tags ?? [],
    pinned: row.pinned,
    views: row.views,
    like_count: row.like_count,
    step_count: steps.length,
    published_at: row.published_at,
  };
}

export const listPublishedTips = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        category: z.enum(TIP_CATEGORY_SLUGS as [string, ...string[]]).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<TipListItem[]> => {
    const supabase = getPublicClient();
    let q = supabase
      .from("tips")
      .select(
        "id, category_slug, title, summary, cover_image_url, tags, pinned, views, like_count, steps, published_at",
      )
      .eq("is_published", true)
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (data.category) q = q.eq("category_slug", data.category);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map(rowToList);
  });

export const listTipCategoryCounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, number>> => {
    const supabase = getPublicClient();
    const { data: rows } = await supabase
      .from("tips")
      .select("category_slug")
      .eq("is_published", true);
    const counts: Record<string, number> = {};
    for (const s of TIP_CATEGORY_SLUGS) counts[s] = 0;
    for (const r of rows ?? []) {
      const k = r.category_slug as string;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  },
);

export const getTipDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }): Promise<TipDetail | null> => {
    const supabase = getPublicClient();
    const { data: row, error } = await supabase
      .from("tips")
      .select(
        "id, category_slug, title, summary, cover_image_url, tags, pinned, views, like_count, steps, published_at, is_published, created_at, updated_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const steps = Array.isArray(row.steps) ? (row.steps as unknown as TipStep[]) : [];
    return {
      ...rowToList(row),
      steps: [...steps].sort((a, b) => a.order - b.order),
      is_published: row.is_published,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

export const incrementTipView = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = getPublicClient();
    await supabase.rpc("increment_tip_views", { _tip_id: data.id });
    return { ok: true };
  });

export const toggleTipLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("tip_likes")
      .select("tip_id")
      .eq("tip_id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("tip_likes")
        .delete()
        .eq("tip_id", data.id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return { liked: false };
    }
    const { error } = await supabase
      .from("tip_likes")
      .insert({ tip_id: data.id, user_id: userId });
    if (error) throw new Error(error.message);
    return { liked: true };
  });

export const getMyTipLikes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("tip_likes")
      .select("tip_id")
      .eq("user_id", userId);
    if (error) return [];
    return (data ?? []).map((r) => r.tip_id as string);
  });
