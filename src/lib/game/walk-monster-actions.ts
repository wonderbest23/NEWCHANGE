import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CATCH_RADIUS_M, haversineM } from "@/lib/game/geo";
import { GAME_ITEMS, STARTER_ITEMS, type GameItemKey } from "@/lib/game/items";
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

const ProfileQuerySchema = z
  .object({
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .optional();

const CatchSchema = z.object({
  spawn_id: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  use_orb: z.boolean().optional(),
});

const PurchaseSchema = z.object({
  item_key: z.string(),
});

function kstDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
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
  /** 레이더 확장기 버프 만료 시점 (radar_extender_until). NULL=비활성. */
  radar_extender_until?: string | null;
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

async function ensureStarterInventory(supabase: { from: (t: string) => any }, userId: string) {
  const { count } = await supabase
    .from("game_inventory" as any)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) > 0) return;

  const rows = STARTER_ITEMS.map((item) => ({
    user_id: userId,
    item_key: item.key,
    quantity: item.quantity,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("game_inventory" as any).insert(rows);
  if (error) throw error;
}

async function getInventory(supabase: { from: (t: string) => any }, userId: string) {
  const { data, error } = await supabase
    .from("game_inventory" as any)
    .select("item_key, quantity")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as Array<{ item_key: string; quantity: number }>;
}

async function adjustInventory(
  supabase: { from: (t: string) => any },
  userId: string,
  itemKey: string,
  delta: number,
): Promise<boolean> {
  const { data: row } = await supabase
    .from("game_inventory" as any)
    .select("quantity")
    .eq("user_id", userId)
    .eq("item_key", itemKey)
    .maybeSingle();

  const current = (row as { quantity: number } | null)?.quantity ?? 0;
  const next = current + delta;
  if (next < 0) return false;

  if (row) {
    const { error } = await supabase
      .from("game_inventory" as any)
      .update({ quantity: next, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("item_key", itemKey);
    if (error) throw error;
  } else if (delta > 0) {
    const { error } = await supabase.from("game_inventory" as any).insert({
      user_id: userId,
      item_key: itemKey,
      quantity: delta,
    });
    if (error) throw error;
  } else {
    return false;
  }
  return true;
}

/**
 * 인벤토리에서 1개 소비를 시도. 성공 시 true.
 * adjustInventory(-1) 의 thin wrapper로, 의도 가독성 ↑.
 */
async function tryConsumeItem(
  supabase: { from: (t: string) => any },
  userId: string,
  itemKey: string,
): Promise<boolean> {
  return adjustInventory(supabase, userId, itemKey, -1);
}

function offsetSpawnLatLng(lat: number, lng: number): { lat: number; lng: number } {
  const angle = Math.random() * Math.PI * 2;
  const distM = 20 + Math.random() * 40;
  const dLat = (distM / 111_320) * Math.cos(angle);
  const dLng = (distM / (111_320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
  return { lat: lat + dLat, lng: lng + dLng };
}

function enrichSpawns(
  spawns: SpawnRow[],
  userLat: number | undefined,
  userLng: number | undefined,
  effectiveRadiusM: number,
): Array<SpawnRow & { distance_m: number | null; in_range: boolean }> {
  return spawns.map((s) => {
    if (userLat == null || userLng == null) {
      return { ...s, distance_m: null, in_range: false };
    }
    const distance_m = Math.round(haversineM(userLat, userLng, s.latitude, s.longitude));
    return { ...s, distance_m, in_range: distance_m <= effectiveRadiusM };
  });
}

function effectiveCatchRadius(profile: ProfileRow): number {
  if (profile.radar_extender_until) {
    const until = new Date(profile.radar_extender_until).getTime();
    if (!Number.isNaN(until) && until > Date.now()) {
      return CATCH_RADIUS_M + 20;
    }
  }
  return CATCH_RADIUS_M;
}

export const getWalkMonsterProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => ProfileQuerySchema.parse(data ?? {}))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const profile = await ensureProfile(supabase, userId);
    await ensureStarterInventory(supabase, userId);
    const inventory = await getInventory(supabase, userId);

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
      .limit(8);

    const todayStart = new Date(`${kstDayKey(new Date())}T00:00:00+09:00`).toISOString();
    const { count: catchesToday } = await supabase
      .from("game_catches" as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayStart);

    const effRadius = effectiveCatchRadius(profile);
    const active = enrichSpawns(
      (spawns ?? []) as SpawnRow[],
      data?.latitude,
      data?.longitude,
      effRadius,
    );

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
        catch_radius_m: effRadius,
        radar_extender_until: profile.radar_extender_until ?? null,
      },
      active_spawns: active,
      inventory,
      catches_today: catchesToday ?? 0,
      daily_limit: DAILY_CATCH_LIMIT,
    };
  });

export const acceptWalkMonsterConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await ensureProfile(supabase, userId);
    await ensureStarterInventory(supabase, userId);
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

      // 행운 부적 (lucky_charm) 이 있으면 1회 소비 후 luckyBoost 활성화.
      // 활성화되면 monster 선택 시 rare/legendary 확률 2배로 다시 굴린다.
      const lucky = await tryConsumeItem(supabase, userId, "lucky_charm");
      let monster = pickMonster(profile.level);
      if (lucky && monster.rarity === "common") {
        // 한 번 더 굴리는 효과 (2x 효과)
        monster = pickMonster(profile.level + 3);
      }
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

    const enriched = enrichSpawns(
      newSpawns,
      data.latitude,
      data.longitude,
      effectiveCatchRadius(profile),
    );

    return {
      ok: true as const,
      added_m: Math.round(deltaM),
      session_distance_m: Math.round(sessionDistance),
      spawn_progress_m: Math.round(spawnProgress),
      spawn_threshold_m: SPAWN_DISTANCE_M,
      new_spawns: enriched,
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

    // 일일 한도 초과 시 — revive_heart(재도전 하트) 가 있으면 1개 소비 후 +5 연장.
    // 이미 한도+5 도 넘었으면 더는 안 됨.
    const baseLimit = DAILY_CATCH_LIMIT;
    const todayCount = catchesToday ?? 0;
    if (todayCount >= baseLimit) {
      const overage = todayCount - baseLimit; // 0,1,2,3,4 이면 추가 가능 (하트가 있다면)
      if (overage >= 5) {
        return { ok: false as const, reason: "daily_limit" as const };
      }
      // overage===0 일 때 하트 1개를 처음 소비. overage>=1이면 이미 하트 효과 안에 있음.
      if (overage === 0) {
        const consumed = await tryConsumeItem(supabase, userId, "revive_heart");
        if (!consumed) {
          return { ok: false as const, reason: "daily_limit" as const };
        }
      }
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

    const distM = haversineM(data.latitude, data.longitude, spawn.latitude, spawn.longitude);
    const effRadius = effectiveCatchRadius(profile);
    if (distM > effRadius + 15) {
      return {
        ok: false as const,
        reason: "too_far" as const,
        distance_m: Math.round(distM),
        required_m: effRadius,
      };
    }

    const rarity = spawn.rarity as MonsterRarity;
    const rewards = RARITY_META[rarity] ?? RARITY_META.common;
    let bonusCoins = 0;
    let usedOrb = false;
    let xpMultiplier = 1;

    if (data.use_orb) {
      const consumed = await adjustInventory(supabase, userId, "capture_orb", -1);
      if (consumed) {
        usedOrb = true;
        bonusCoins = 5;
      }
    }

    // XP 두배권 — 가지고 있으면 자동 소비, 이번 포획 XP 2배.
    // (사용자 선택 UI는 추후, 현재는 항상 적용 — "있으면 좋은 결과" 자동 적용)
    const xpBoosted = await tryConsumeItem(supabase, userId, "xp_doubler");
    if (xpBoosted) xpMultiplier = 2;

    const xpGained = rewards.xp * xpMultiplier;
    const newXp = profile.xp + xpGained;
    const newLevel = levelFromXp(newXp);
    const newCoins = profile.coins + rewards.coins + bonusCoins;

    const { error: catchErr } = await supabase.from("game_catches" as any).insert({
      user_id: userId,
      spawn_id: data.spawn_id,
      xp_gained: xpGained,
      coins_gained: rewards.coins + bonusCoins,
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
      xp_gained: xpGained,
      coins_gained: rewards.coins + bonusCoins,
      used_orb: usedOrb,
      xp_doubled: xpBoosted,
      level: newLevel,
      total_xp: newXp,
      total_coins: newCoins,
    };
  });

export const purchaseWalkMonsterItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => PurchaseSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const item = GAME_ITEMS[data.item_key as GameItemKey];
    if (!item) {
      return { ok: false as const, reason: "invalid_item" as const };
    }

    const profile = await ensureProfile(supabase, userId);
    if (profile.coins < item.price) {
      return { ok: false as const, reason: "not_enough_coins" as const };
    }

    const { error: coinErr } = await supabase
      .from("game_profiles" as any)
      .update({
        coins: profile.coins - item.price,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (coinErr) throw coinErr;

    await adjustInventory(supabase, userId, item.key, 1);

    return { ok: true as const, item_key: item.key, coins_left: profile.coins - item.price };
  });

export const useWalkMonsterRadarExtender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const consumed = await tryConsumeItem(supabase, userId, "radar_extender");
    if (!consumed) {
      return { ok: false as const, reason: "no_item" as const };
    }
    const until = new Date(Date.now() + 30 * 60_000).toISOString();
    const { error } = await supabase
      .from("game_profiles" as any)
      .update({ radar_extender_until: until, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true as const, until };
  });

export const useWalkMonsterBooster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const profile = await ensureProfile(supabase, userId);
    const consumed = await adjustInventory(supabase, userId, "step_booster", -1);
    if (!consumed) {
      return { ok: false as const, reason: "no_item" as const };
    }

    const nextProgress = Math.max(0, profile.spawn_progress_m - 10);
    const { error } = await supabase
      .from("game_profiles" as any)
      .update({ spawn_progress_m: nextProgress, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw error;

    return { ok: true as const, spawn_progress_m: Math.round(nextProgress) };
  });

export const getWalkMonsterLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // game_leaderboard_v 는 rank() window 함수로 정확한 순위 부여.
    // top 10 + 본인 행을 각각 조회한다.
    const { data: topRows, error: topErr } = await supabaseAdmin
      .from("game_leaderboard_v" as any)
      .select("user_id, total_catches, level, xp, rank")
      .order("rank", { ascending: true })
      .limit(10);
    if (topErr) throw topErr;

    const list = (topRows ?? []) as unknown as Array<{
      user_id: string;
      total_catches: number;
      level: number;
      xp: number;
      rank: number;
    }>;

    // 본인 행을 뷰에서 직접 조회 (top 10 안에 있어도 동일하게 조회 — RTT 작아 OK).
    const { data: meRow } = await supabaseAdmin
      .from("game_leaderboard_v" as any)
      .select("user_id, total_catches, level, xp, rank")
      .eq("user_id", userId)
      .maybeSingle();

    const me = meRow as unknown as
      | { user_id: string; total_catches: number; level: number; xp: number; rank: number }
      | null;

    const ids = list.map((r) => r.user_id);
    if (me && !ids.includes(userId)) ids.push(userId);

    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, nickname").in("id", ids)
      : { data: [] as Array<{ id: string; nickname: string | null }> };

    const nameMap = new Map(
      ((profs ?? []) as Array<{ id: string; nickname: string | null }>).map((p) => [
        p.id,
        p.nickname ?? "이웃",
      ]),
    );

    const top = list.map((r) => ({
      rank: r.rank,
      user_id: r.user_id,
      nickname: nameMap.get(r.user_id) ?? "이웃",
      total_catches: r.total_catches,
      level: r.level,
      is_me: r.user_id === userId,
    }));

    return {
      top,
      me: me
        ? {
            rank: me.rank,
            nickname: nameMap.get(userId) ?? "나",
            total_catches: me.total_catches,
            level: me.level,
          }
        : null,
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
