/**
 * 산책 몬스터 조우(Encounter) FSM — POGO-style explore → fight → throw → result.
 */

export type EncounterPhase =
  | "walking"
  | "encounter_enter"
  | "encounter_fight"
  | "capture_throw"
  | "capturing"
  | "caught"
  | "fled";

export function encounterShowsMonster(phase: EncounterPhase): boolean {
  return (
    phase === "encounter_enter" ||
    phase === "encounter_fight" ||
    phase === "capture_throw" ||
    phase === "capturing"
  );
}

export function encounterBlocksWalkingUi(phase: EncounterPhase): boolean {
  return phase !== "walking" && phase !== "caught" && phase !== "fled";
}

export const ENCOUNTER_ENTER_MS = 800;
export const FLEE_MISS_LIMIT = 5;
export const LEGENDARY_FLEE_MS = 45_000;
