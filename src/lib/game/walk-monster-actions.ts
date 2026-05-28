import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DAILY_CATCH_LIMIT,
  RARITY_META,
  SPAWN_DISTANCE_M,
  SPAWN_TTL_MIN,
  levelFromXp,
  monsterByKey,
  pickMonster,
  type MonsterRarity,
} from "@/lib/game/monsters";

const SyncSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_m: z.number().nullable().optional(),
  client_delta_m: z.number().min(0).max(200),
});

const CatchSchema = z.object({
  spawn_id: z.string().uuid(),
});

function kstDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type ProfileRow = {
  user_id: string;
  xp: number;
  level: number;
  coins: number;
  total_catches: number;
  session_distance_m: number;
  spawn_progress_m: number;
  last_lat: number | null;
  last_lng: number | null;
  location_consent_at: string | null;
};

type SpawnRow = {
  id: string;
  monster_key: string;
  rarity: MonsterRarity;
  latitude: number;
  longitude: number;
  status: string;
  expires_at: string;
  created_at: string;
};

async function ensureProfile(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<ProfileRow> {
  const { data: existing } = await supabase
    .from("game_profiles" as any)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return existing as ProfileRow;

  const { data: created, error } = await supabase
    .from("game_profiles" as any)
    .insert({ user_id: userId })
    .select("*")
    .single();
  if (error) throw error;
  return created as ProfileRow;
}

function offsetSpawnLatLng(lat: number, lng: number): { lat: number; lng: number } {
  const angle = Math.random() * Math.PI * 2;
  const distM = 15 + Math.random() * 35;
  const dLat = (distM / 111_320) * Math.cos(angle);
  const dLng = (distM / (111_320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
  return { lat: lat + dLat, lng: lng + dLng };
}

export const getWalkMonsterProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const profile = await ensureProfile(supabase, userId);

    const now = new Date().toISOString();
    await supabase
      .from("game_spawns" as any)
      .update({ status: "expired" })
      .eq("user_id", userId)
      .eq("status", "active")
      .lt("expires_at", now);

    const { data: spawns } = await supabase
      .from("game_spawns" as any)
      .select("id, monster_key, rarity, latitude, longitude, status, expires_at, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .gte("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(5);

    const todayStart = new Date(`${kstDayKey(new Date())}T00:00:00+09:00`).toISOString();
    const { count: catchesToday } = await supabase
      .from("game_catches" as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayStart);

    return {
      profile: {
        xp: profile.xp,
        level: profile.level,
        coins: profile.coins,
        total_catches: profile.total_catches,
        session_distance_m: Math.round(profile.session_distance_m),
        spawn_progress_m: Math.round(profile.spawn_progress_m),
        spawn_threshold_m: SPAWN_DISTANCE_M,
        has_consent: !!profile.location_consent_at,
      },
      active_spawns: (spawns ?? []) as SpawnRow[],
      catches_today: catchesToday ?? 0,
      daily_limit: DAILY_CATCH_LIMIT,
    };
  });

export const acceptWalkMonsterConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await ensureProfile(supabase, userId);
    const { error } = await supabase
      .from("game_profiles" as any)
      .update({ location_consent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true as const };
  });

export const syncWalkMonsterSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => SyncSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const profile = await ensureProfile(supabase, userId);

    if (!profile.location_consent_at) {
      throw new Response("위치·게임 이용 동의가 필요해요", { status: 403 });
    }

    if (data.accuracy_m != null && data.accuracy_m > 120) {
      return {
        ok: false as const,
        reason: "gps_weak" as const,
        message: "GPS 신호가 약해요. 잠시 후 다시 시도해 주세요.",
      };
    }

    let deltaM = data.client_delta_m;
    if (profile.last_lat != null && profile.last_lng != null) {
      const serverM = haversineM(profile.last_lat, profile.last_lng, data.latitude, data.longitude);
      if (serverM < deltaM * 0.35) {
        deltaM = serverM;
      } else if (deltaM > serverM * 2.5 && serverM > 0) {
        deltaM = serverM;
      }
      if (serverM > 0 && serverM / Math.max(deltaM, 0.1) > 25) {
        return {
          ok: false as const,
          reason: "speed" as const,
          message: "이동 속도가 너무 빨라요. 걸어서 이동해 주세요.",
        };
      }
    }

    if (deltaM > 80) deltaM = 80;

    let spawnProgress = profile.spawn_progress_m + deltaM;
    let sessionDistance = profile.session_distance_m + deltaM;
    const newSpawns: SpawnRow[] = [];

    while (spawnProgress >= SPAWN_DISTANCE_M) {
      spawnProgress -= SPAWN_DISTANCE_M;
      const monster = pickMonster(profile.level);
      const offset = offsetSpawnLatLng(data.latitude, data.longitude);
      const expiresAt = new Date(Date.now() + SPAWN_TTL_MIN * 60_000).toISOString();

      const { data: row, error } = await supabase
        .from("game_spawns" as any)
        .insert({
          user_id: userId,
          monster_key: monster.key,
          rarity: monster.rarity,
          latitude: offset.lat,
          longitude: offset.lng,
          expires_at: expiresAt,
        })
        .select("id, monster_key, rarity, latitude, longitude, status, expires_at, created_at")
        .single();
      if (error) throw error;
      newSpawns.push(row as SpawnRow);
    }

    const { error: upErr } = await supabase
      .from("game_profiles" as any)
      .update({
        session_distance_m: sessionDistance,
        spawn_progress_m: spawnProgress,
        last_lat: data.latitude,
        last_lng: data.longitude,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (upErr) throw upErr;

    return {
      ok: true as const,
      added_m: Math.round(deltaM),
      session_distance_m: Math.round(sessionDistance),
      spawn_progress_m: Math.round(spawnProgress),
      spawn_threshold_m: SPAWN_DISTANCE_M,
      new_spawns: newSpawns,
    };
  });

export const catchWalkMonster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CatchSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const profile = await ensureProfile(supabase, userId);

    const todayStart = new Date(`${kstDayKey(new Date())}T00:00:00+09:00`).toISOString();
    const { count: catchesToday } = await supabase
      .from("game_catches" as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayStart);

    if ((catchesToday ?? 0) >= DAILY_CATCH_LIMIT) {
      return { ok: false as const, reason: "daily_limit" as const };
    }

    const { data: spawn, error: spawnErr } = await supabase
      .from("game_spawns" as any)
      .select("*")
      .eq("id", data.spawn_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (spawnErr) throw spawnErr;
    if (!spawn || spawn.status !== "active") {
      return { ok: false as const, reason: "not_found" as const };
    }
    if (new Date(spawn.expires_at) < new Date()) {
      await supabase.from("game_spawns" as any).update({ status: "expired" }).eq("id", data.spawn_id);
      return { ok: false as const, reason: "expired" as const };
    }

    const rarity = spawn.rarity as MonsterRarity;
    const rewards = RARITY_META[rarity] ?? RARITY_META.common;
    const newXp = profile.xp + rewards.xp;
    const newLevel = levelFromXp(newXp);
    const newCoins = profile.coins + rewards.coins;

    const { error: catchErr } = await supabase.from("game_catches" as any).insert({
      user_id: userId,
      spawn_id: data.spawn_id,
      xp_gained: rewards.xp,
      coins_gained: rewards.coins,
    });
    if (catchErr) {
      if (catchErr.code === "23505") return { ok: false as const, reason: "already" as const };
      throw catchErr;
    }

    await supabase.from("game_spawns" as any).update({ status: "caught" }).eq("id", data.spawn_id);

    await supabase
      .from("game_profiles" as any)
      .update({
        xp: newXp,
        level: newLevel,
        coins: newCoins,
        total_catches: profile.total_catches + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    const def = monsterByKey(spawn.monster_key);

    return {
      ok: true as const,
      monster_key: spawn.monster_key,
      monster_name: def?.name ?? spawn.monster_key,
      monster_emoji: def?.emoji ?? "✨",
      rarity,
      xp_gained: rewards.xp,
      coins_gained: rewards.coins,
      level: newLevel,
      total_xp: newXp,
      total_coins: newCoins,
    };
  });

export const resetWalkMonsterSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await ensureProfile(supabase, userId);
    const { error } = await supabase
      .from("game_profiles" as any)
      .update({
        session_distance_m: 0,
        spawn_progress_m: 0,
        last_lat: null,
        last_lng: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true as const };
  });
