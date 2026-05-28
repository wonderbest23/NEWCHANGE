import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type EmotionRecFeedbackRow = {
  id: string;
  user_id: string;
  checkin_id: string | null;
  emotion_key: string;
  cache_key: string | null;
  source: string | null;
  helpful: boolean;
  comment: string | null;
  created_at: string;
};

export type EmotionRecFeedbackStats = {
  total: number;
  helpful: number;
  notHelpful: number;
  byEmotion: Record<string, number>;
  bySource: Record<string, number>;
};

async function requireAdmin(userId: string) {
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) throw new Error("관리자만 접근할 수 있어요");
}

const listSchema = z.object({
  limit: z.number().int().min(1).max(200).default(80),
});

export const adminEmotionRecFeedbackStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmotionRecFeedbackStats> => {
    await requireAdmin(context.userId);
    const sb = supabaseAdmin as any;
    const { data, error } = await sb
      .from("emotion_rec_feedback")
      .select("helpful, emotion_key, source");
    if (error) throw new Error(error.message);

    const stats: EmotionRecFeedbackStats = {
      total: data?.length ?? 0,
      helpful: 0,
      notHelpful: 0,
      byEmotion: {},
      bySource: {},
    };
    for (const row of data ?? []) {
      if (row.helpful) stats.helpful += 1;
      else stats.notHelpful += 1;
      const ek = row.emotion_key ?? "unknown";
      stats.byEmotion[ek] = (stats.byEmotion[ek] ?? 0) + 1;
      const src = row.source ?? "unknown";
      stats.bySource[src] = (stats.bySource[src] ?? 0) + 1;
    }
    return stats;
  });

export const adminListEmotionRecFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listSchema.parse(d ?? {}))
  .handler(async ({ context, data }): Promise<EmotionRecFeedbackRow[]> => {
    await requireAdmin(context.userId);
    const sb = supabaseAdmin as any;
    const { data: rows, error } = await sb
      .from("emotion_rec_feedback")
      .select("id, user_id, checkin_id, emotion_key, cache_key, source, helpful, comment, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as EmotionRecFeedbackRow[];
  });
