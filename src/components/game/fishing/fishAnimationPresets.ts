export type FishAnimationPreset =
  | "fish_flop_default"
  | "fish_flop_heavy"
  | "fish_float_magic"
  | "fish_fast_escape";

export type CaughtFishState =
  | "hidden"
  | "breach"
  | "land"
  | "flop"
  | "captured"
  | "escape";

type PresetTuning = {
  breachHeight: number;
  breachTravel: number;
  breachSpin: number;
  flopAmp: number;
  flopSpeed: number;
  flopRot: number;
  captureRise: number;
  escapeSpeed: number;
};

const PRESETS: Record<FishAnimationPreset, PresetTuning> = {
  fish_flop_default: {
    breachHeight: 0.92,
    breachTravel: 0.28,
    breachSpin: 2.2,
    flopAmp: 0.16,
    flopSpeed: 10.2,
    flopRot: 0.46,
    captureRise: 0.72,
    escapeSpeed: 1.6,
  },
  fish_flop_heavy: {
    breachHeight: 0.78,
    breachTravel: 0.22,
    breachSpin: 1.6,
    flopAmp: 0.12,
    flopSpeed: 8.4,
    flopRot: 0.36,
    captureRise: 0.62,
    escapeSpeed: 1.2,
  },
  fish_float_magic: {
    breachHeight: 1.06,
    breachTravel: 0.24,
    breachSpin: 1.3,
    flopAmp: 0.08,
    flopSpeed: 6.2,
    flopRot: 0.24,
    captureRise: 0.96,
    escapeSpeed: 1.5,
  },
  fish_fast_escape: {
    breachHeight: 0.66,
    breachTravel: 0.18,
    breachSpin: 2.6,
    flopAmp: 0.14,
    flopSpeed: 12.4,
    flopRot: 0.52,
    captureRise: 0.66,
    escapeSpeed: 2.4,
  },
};

export type Pose = {
  y: number;
  x: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
};

export function poseForFishState(
  preset: FishAnimationPreset,
  state: CaughtFishState,
  t: number,
  floorY: number,
): Pose {
  const cfg = PRESETS[preset];
  if (state === "hidden") {
    return { x: 0, y: floorY - 10, rotationX: 0, rotationY: 0, rotationZ: 0, scale: 0.01 };
  }

  if (state === "breach") {
    const p = Math.min(1, t / 0.58);
    const y = floorY + Math.sin(p * Math.PI) * cfg.breachHeight;
    const lift = Math.sin(p * Math.PI);
    return {
      x: (p - 0.5) * cfg.breachTravel,
      y,
      rotationX: -0.28 + lift * (0.55 + cfg.breachSpin * 0.12),
      rotationY: Math.sin(p * 5.0) * 0.22,
      rotationZ: Math.sin(p * 7.0) * 0.32 * cfg.breachSpin * 0.2,
      scale: 1 + lift * 0.04,
    };
  }

  if (state === "land") {
    const p = Math.min(1, t / 0.45);
    const bounce = Math.sin(p * Math.PI) * (1 - p) * 0.14;
    return {
      x: 0.05 * Math.sin(p * 10),
      y: floorY + bounce,
      rotationX: 0.1 + Math.sin(p * 8.0) * 0.14,
      rotationY: Math.sin(p * 4.0) * 0.1,
      rotationZ: Math.sin(p * 12.0) * 0.22,
      scale: 1 - p * 0.02,
    };
  }

  if (state === "flop") {
    const damp = Math.max(0.12, 1.0 - t / 2.5);
    const hop = Math.abs(Math.sin(t * cfg.flopSpeed)) * cfg.flopAmp * damp;
    return {
      x: Math.sin(t * 3.8) * 0.08 * damp,
      y: floorY + hop,
      rotationX: 0.12 + Math.sin(t * cfg.flopSpeed) * 0.2 * damp,
      rotationY: Math.sin(t * 5.2) * 0.14 * damp,
      rotationZ: Math.sin(t * cfg.flopSpeed) * cfg.flopRot * damp,
      scale: 1 + Math.sin(t * 6.0) * 0.04 * damp,
    };
  }

  if (state === "captured") {
    const p = Math.min(1, t / 0.66);
    return {
      x: 0,
      y: floorY + p * cfg.captureRise,
      rotationX: 0.18 + p * 0.42,
      rotationY: p * 0.35,
      rotationZ: Math.sin(t * 18) * 0.12 * (1 - p),
      scale: Math.max(0.18, 1 - p * 0.85),
    };
  }

  const p = Math.min(1, t / 0.55);
  return {
    x: p * cfg.escapeSpeed,
    y: floorY + Math.sin(t * 12) * 0.06,
    rotationX: 0.14 + p * 0.35,
    rotationY: Math.sin(t * 10) * 0.24,
    rotationZ: Math.sin(t * 14) * 0.32,
    scale: 1,
  };
}
