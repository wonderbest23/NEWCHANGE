import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type WalkTier = "master" | "expert" | "steady" | "starter" | "none";

export type LeaderRow = {
  rank: number;
  user_id: string;
  nickname: string;
  region_sigungu: string | null;
  total: number;
  tier: WalkTier;
};

export const TIER_META: Record<WalkTier, { label: string; emoji: string; min: number }> = {
  master: { label: "산책 마스터", emoji: "🏞️", min: 30 },
  expert: { label: "산책 달인", emoji: "🌳", min: 15 },
  steady: { label: "꾸준 산책러", emoji: "🚶", min: 7 },
  starter: { label: "산책 새싹", emoji: "🌱", min: 1 },
  none: { label: "도전 전", emoji: "✨", min: 0 },
};

function tierOf(total: number): WalkTier {
  if (total >= 30) return "master";
  if (total >= 15) return "expert";
  if (total >= 7) return "steady";
  if (total >= 1) return "starter";
  return "none";
}

export const getWalkLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ top: LeaderRow[]; me: LeaderRow | null }> => {
    const { userId } = context;

    // 전체 산책 횟수 집계 (모든 사용자) — 집계만, 좌표/시각 미노출
    const { data: rows, error } = await supabaseAdmin
      .from("walk_checkins" as any)
      .select("user_id");
    if (error) throw error;

    const counts = new Map<string, number>();
    for (const r of ((rows ?? []) as unknown as Array<{ user_id: string }>)) {
      counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
    }

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

    // 상위 사용자 + 내 위치 확보용 프로필
    const userIds = sorted.map(([id]) => id);
    if (!counts.has(userId)) userIds.push(userId);

    const { data: profs } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, nickname, region_sigungu")
          .in("id", userIds)
      : { data: [] as Array<{ id: string; nickname: string | null; region_sigungu: string | null }> };

    const profMap = new Map(
      ((profs ?? []) as Array<{ id: string; nickname: string | null; region_sigungu: string | null }>).map((p) => [
        p.id,
        p,
      ]),
    );

    const top: LeaderRow[] = sorted.slice(0, 20).map(([id, total], i) => {
      const p = profMap.get(id);
      return {
        rank: i + 1,
        user_id: id,
        nickname: p?.nickname ?? "이웃",
        region_sigungu: p?.region_sigungu ?? null,
        total,
        tier: tierOf(total),
      };
    });

    let me: LeaderRow | null = null;
    const myIndex = sorted.findIndex(([id]) => id === userId);
    const myTotal = counts.get(userId) ?? 0;
    const myProf = profMap.get(userId);
    me = {
      rank: myIndex >= 0 ? myIndex + 1 : sorted.length + 1,
      user_id: userId,
      nickname: myProf?.nickname ?? "나",
      region_sigungu: myProf?.region_sigungu ?? null,
      total: myTotal,
      tier: tierOf(myTotal),
    };

    return { top, me };
  });
