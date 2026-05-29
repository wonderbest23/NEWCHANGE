/**
 * 포켓볼 던지기 screen-space physics (POGO-inspired).
 */

export type ThrowGrade = "miss" | "nice" | "great" | "excellent";

export interface ThrowInput {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  /** normalized viewport 0..1 */
  monsterCenterX: number;
  monsterCenterY: number;
  monsterRadius: number;
}

export interface ThrowResult {
  hit: boolean;
  grade: ThrowGrade;
  /** 0..1 throw power from swipe length */
  power: number;
}

const GRADE_THRESHOLDS = {
  excellent: 0.12,
  great: 0.22,
  nice: 0.35,
} as const;

export function evaluateThrow(input: ThrowInput): ThrowResult {
  const dx = input.endX - input.startX;
  const dy = input.endY - input.startY;
  const dist = Math.hypot(dx, dy);
  const power = Math.min(1, dist / 280);

  if (power < 0.08 || dy > -20) {
    return { hit: false, grade: "miss", power };
  }

  const mx = input.monsterCenterX;
  const my = input.monsterCenterY;
  const r = input.monsterRadius;
  const hitX = input.endX;
  const hitY = input.endY;
  const d = Math.hypot(hitX - mx, hitY - my);

  if (d > r * 1.15) {
    return { hit: false, grade: "miss", power };
  }

  const norm = d / Math.max(0.01, r);
  let grade: ThrowGrade = "nice";
  if (norm <= GRADE_THRESHOLDS.excellent) grade = "excellent";
  else if (norm <= GRADE_THRESHOLDS.great) grade = "great";
  else if (norm <= GRADE_THRESHOLDS.nice) grade = "nice";

  return { hit: true, grade, power };
}

/** Quadratic bezier for throw arc overlay. */
export function bezierPoint(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/** Wiggle resist — tap within window after shake peak. */
export function wiggleCatchChance(
  rarity: "common" | "rare" | "legendary",
  grade: ThrowGrade,
  shakeIndex: number,
): number {
  const base =
    rarity === "legendary" ? 0.35 : rarity === "rare" ? 0.5 : 0.65;
  const gradeBonus =
    grade === "excellent" ? 0.2 : grade === "great" ? 0.12 : grade === "nice" ? 0.05 : 0;
  const shakePenalty = shakeIndex * 0.08;
  return Math.max(0.15, Math.min(0.92, base + gradeBonus - shakePenalty));
}
