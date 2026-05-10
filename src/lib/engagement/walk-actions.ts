import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RecordSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_m: z.number().nullable().optional(),
});

function kstDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

/** GPS 위치를 받아 오늘의 산책 인증을 기록 (하루 1회만) */
export const recordWalkCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => RecordSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // 오늘 이미 인증했는지 확인
    const todayStartISO = new Date(`${kstDayKey(new Date())}T00:00:00+09:00`).toISOString();
    const { data: existing } = await supabase
      .from("walk_checkins" as any)
      .select("id")
      .eq("user_id", userId)
      .gte("checkin_at", todayStartISO)
      .maybeSingle();

    if (existing) {
      return { ok: true as const, alreadyDone: true as const };
    }

    // 사용자의 첫 family_id 조회 (보호자 공유용)
    const { data: fam } = await supabase
      .from("family_members")
      .select("family_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("walk_checkins" as any).insert({
      user_id: userId,
      family_id: fam?.family_id ?? null,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy_m: data.accuracy_m ?? null,
    });
    if (error) throw error;

    return { ok: true as const, alreadyDone: false as const };
  });

/** 산책 통계: 오늘 인증 여부, 총 횟수, 7일 연속 여부 */
export const getWalkStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: rows } = await supabase
      .from("walk_checkins" as any)
      .select("checkin_at")
      .eq("user_id", userId)
      .gte("checkin_at", since.toISOString())
      .order("checkin_at", { ascending: false });

    const todayKey = kstDayKey(new Date());
    const dayKeys = new Set<string>(
      ((rows ?? []) as unknown as Array<{ checkin_at: string }>).map((r) => kstDayKey(new Date(r.checkin_at))),
    );

    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (dayKeys.has(kstDayKey(d))) streak++;
      else if (i > 0) break;
    }

    const { count } = await supabase
      .from("walk_checkins" as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    return {
      doneToday: dayKeys.has(todayKey),
      total: count ?? 0,
      streak,
    };
  });
