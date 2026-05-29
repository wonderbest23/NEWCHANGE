/**
 * 웹 AR 지면 휴리스틱 — 네이티브 hit-test 전 카메라 pitch + 화면 Y로 ground line 추정.
 */

export const DEFAULT_GROUND_SCREEN_Y = 0.58;

/** 화면 정규 Y(0=top, 1=bottom) → 카메라 로컬 world Y at depth. */
export function screenYToWorldY(
  screenYNorm: number,
  renderDepth: number,
  vfovDeg: number,
): number {
  const vfovRad = (vfovDeg * Math.PI) / 180;
  const halfHeight = Math.tan(vfovRad / 2) * renderDepth;
  return (0.5 - screenYNorm) * 2 * halfHeight;
}

/** 객체 앵커 또는 기울기로 지면 screen Y 추정. */
export function computeGroundScreenY(opts: {
  pitchRad?: number | null;
  /** detection box top (0..1) */
  anchorTopY?: number;
  anchorCategory?: string;
}): number {
  const { pitchRad, anchorTopY, anchorCategory } = opts;
  if (anchorTopY != null && anchorCategory) {
    const surface = ["chair", "bench", "couch", "sofa", "dining table"].includes(
      anchorCategory,
    );
    if (surface) {
      return Math.max(0.38, Math.min(0.68, anchorTopY - 0.04));
    }
    return Math.max(0.42, Math.min(0.7, anchorTopY + 0.02));
  }
  const pitch = pitchRad ?? 0;
  const base = DEFAULT_GROUND_SCREEN_Y + pitch * 0.12;
  return Math.max(0.44, Math.min(0.68, base));
}

/** MediaPipe anchor lerp — 안정 시 hold. */
export function anchorLerpFactor(stableFrames: number): number {
  if (stableFrames >= 8) return 0.68;
  if (stableFrames >= 3) return 0.55;
  return 0.38;
}
