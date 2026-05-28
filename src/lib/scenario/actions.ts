/**
 * 시나리오/펫/협동 공통 server fn 모음.
 *
 * - markStepComplete:   edu 시나리오 단계 완료 저장 + XP 보상
 * - getScenarioStatus:  사용자별 완료된 단계 + 잠금 여부
 * - getOrCreatePet:     첫 펫 자동 생성
 * - interactWithPet:    먹이/놀기/쓰다듬기 액션 + 펫 상태 업데이트
 * - createCoopPair:     pair_code 생성 (host)
 * - joinCoopPair:       pair_code 로 guest 합류
 * - endCoopPair:        세션 종료
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StepCompleteSchema = z.object({
  scenario_id: z.string().min(1),
  step_key: z.string().min(1),
  score: z.number().int().min(0).max(100).optional(),
});

export const markStepComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => StepCompleteSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // upsert — 같은 단계 재시도해도 1 row 만 유지
    const { error } = await supabase
      .from("user_progress" as never)
      .upsert(
        {
          user_id: userId,
          scenario_id: data.scenario_id,
          step_key: data.step_key,
          score: data.score ?? null,
          completed_at: new Date().toISOString(),
        } as never,
        { onConflict: "user_id,scenario_id,step_key" } as never,
      );
    if (error) return { ok: false as const, reason: error.message };
    return { ok: true as const };
  });

const ScenarioStatusSchema = z.object({ scenario_id: z.string().min(1) });
export const getScenarioStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ScenarioStatusSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("user_progress" as never)
      .select("step_key, score, completed_at")
      .eq("user_id", userId)
      .eq("scenario_id", data.scenario_id);
    return {
      completedSteps: ((rows ?? []) as unknown as Array<{
        step_key: string;
        score: number | null;
        completed_at: string;
      }>),
    };
  });

// ── 펫 ────────────────────────────────────────────────────────────────────────

interface PetRow {
  id: string;
  user_id: string;
  name: string;
  species: string;
  level: number;
  exp: number;
  affinity: number;
  mood: "happy" | "hungry" | "sleepy" | "playful" | "sad";
  hunger: number;
  last_interaction_at: string | null;
}

function moodFrom(hunger: number, affinity: number): PetRow["mood"] {
  if (hunger >= 80) return "hungry";
  if (affinity < 30) return "sad";
  if (affinity >= 80) return "playful";
  return "happy";
}

export const getOrCreatePet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("pets" as never)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      return { ok: true as const, pet: existing as unknown as PetRow };
    }
    const { data: created, error } = await supabase
      .from("pets" as never)
      .insert({ user_id: userId } as never)
      .select("*")
      .single();
    if (error || !created) return { ok: false as const, reason: error?.message ?? "create_failed" };
    return { ok: true as const, pet: created as unknown as PetRow };
  });

const PetActionSchema = z.object({ action: z.enum(["pet", "feed", "play", "train"]) });

export const interactWithPet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PetActionSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: petData } = await supabase
      .from("pets" as never)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!petData) return { ok: false as const, reason: "no_pet" };
    const pet = petData as unknown as PetRow;

    // 액션별 효과 (작은 숫자로 — 누적 게임플레이)
    let dAff = 0;
    let dHunger = 0;
    let exp = 0;
    if (data.action === "pet") {
      dAff = 3;
      exp = 2;
    } else if (data.action === "feed") {
      dAff = 5;
      dHunger = -25;
      exp = 4;
    } else if (data.action === "play") {
      dAff = 6;
      dHunger = 8;
      exp = 6;
    } else if (data.action === "train") {
      dAff = 4;
      dHunger = 12;
      exp = 10;
    }

    const newAff = Math.max(0, Math.min(100, pet.affinity + dAff));
    const newHunger = Math.max(0, Math.min(100, pet.hunger + dHunger));
    const newExp = pet.exp + exp;
    const newLevel = Math.max(1, Math.floor(Math.sqrt(newExp / 30)) + 1);

    await supabase
      .from("pets" as never)
      .update({
        affinity: newAff,
        hunger: newHunger,
        exp: newExp,
        level: newLevel,
        mood: moodFrom(newHunger, newAff),
        last_interaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", pet.id);

    await supabase.from("pet_interactions" as never).insert({
      user_id: userId,
      pet_id: pet.id,
      action: data.action,
      exp_gained: exp,
      delta_affinity: dAff,
    } as never);

    return {
      ok: true as const,
      pet: {
        ...pet,
        affinity: newAff,
        hunger: newHunger,
        exp: newExp,
        level: newLevel,
        mood: moodFrom(newHunger, newAff),
      },
      gained: { exp, dAff },
    };
  });

// ── 협동 (Coop) ───────────────────────────────────────────────────────────────

function newPairCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 혼동 글자 제외
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export const createCoopPair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    let code = newPairCode();
    // 충돌 방지 3회 재시도
    for (let i = 0; i < 3; i++) {
      const { data, error } = await supabase
        .from("coop_pairs" as never)
        .insert({ host_user_id: userId, pair_code: code, status: "waiting" } as never)
        .select("*")
        .single();
      if (!error && data) {
        return { ok: true as const, pair: data as unknown as { id: string; pair_code: string } };
      }
      // unique violation 이면 재시도
      code = newPairCode();
    }
    return { ok: false as const, reason: "code_collision" };
  });

const JoinCoopSchema = z.object({ pair_code: z.string().length(6) });
export const joinCoopPair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => JoinCoopSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: pair } = await supabase
      .from("coop_pairs" as never)
      .select("*")
      .eq("pair_code", data.pair_code.toUpperCase())
      .eq("status", "waiting")
      .maybeSingle();
    if (!pair) return { ok: false as const, reason: "not_found" };
    const p = pair as unknown as { id: string; host_user_id: string };
    if (p.host_user_id === userId) return { ok: false as const, reason: "self_pair" };

    const { error } = await supabase
      .from("coop_pairs" as never)
      .update({
        guest_user_id: userId,
        status: "active",
        joined_at: new Date().toISOString(),
      } as never)
      .eq("id", p.id);
    if (error) return { ok: false as const, reason: error.message };
    return { ok: true as const, pair_id: p.id };
  });

const EndCoopSchema = z.object({ pair_id: z.string().uuid() });
export const endCoopPair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => EndCoopSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    await supabase
      .from("coop_pairs" as never)
      .update({ status: "ended", ended_at: new Date().toISOString() } as never)
      .eq("id", data.pair_id);
    return { ok: true as const };
  });
