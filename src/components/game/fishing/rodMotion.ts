import type { PondPhase } from "./createFishingPond";

/** 낚싯대 팁이 뻗는 로컬 축 — 카메라 전방(-Z)과 동일. */
export const ROD_TIP_AXIS = Object.freeze({ x: 0, y: 0, z: -1 });

export type RodMotionInput = {
  phase: PondPhase | "floating";
  castPower: number;
  tension: number;
  time: number;
  dt: number;
  /** floating 진입 후 경과 초 (캐스트 스윙) */
  castSwingElapsed: number;
  /** 0..1 화면 정규화 — 팁이 찌 방향을 살짝 따라감 */
  bobberX?: number;
  bobberY?: number;
  /** FishingArScene에서 스무딩된 조준 각 (rad) */
  aimYaw?: number;
  aimPitch?: number;
};

export type RodMotionOutput = {
  pitch: number;
  yaw: number;
  roll: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
};

function easeOutCubic(t: number) {
  const u = 1 - Math.max(0, Math.min(1, t));
  return 1 - u * u * u;
}

function easeInOutQuad(t: number) {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/** 준1인칭 낚싯대: 캐스팅 스윙 · 입질 · 힘겨루기 흔들림 */
/** 찌 화면 좌표 → 낚싯대 미세 조준 (rad) */
export function bobberAimAngles(
  bobberX: number,
  bobberY: number,
  phase: PondPhase | "floating",
): { yaw: number; pitch: number } {
  const active =
    phase === "waiting" ||
    phase === "floating" ||
    phase === "bite" ||
    phase === "fighting";
  if (!active) return { yaw: 0, pitch: 0 };
  const fightMul = phase === "fighting" ? 1.2 : phase === "bite" ? 1.35 : 1;
  return {
    yaw: (bobberX - 0.46) * 0.18 * fightMul,
    pitch: (0.5 - bobberY) * 0.13 * fightMul,
  };
}

export function computeRodMotion(input: RodMotionInput): RodMotionOutput {
  const { phase, castPower, tension, time, castSwingElapsed, aimYaw = 0, aimPitch = 0 } =
    input;
  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  let offsetX = 0;
  let offsetY = 0;
  let offsetZ = 0;

  const idleSway = Math.sin(time * 1.8) * 0.018;
  const idleRoll = Math.sin(time * 2.4 + 0.6) * 0.012;

  if (phase === "ready") {
    pitch = idleSway;
    roll = idleRoll;
  } else if (phase === "casting") {
    const windUp = easeInOutQuad(castPower);
    pitch = 0.08 + windUp * 0.42;
    yaw = Math.sin(time * 3.5) * 0.02 * windUp;
    roll = -0.04 - windUp * 0.1;
  } else if (phase === "floating") {
    const swingT = Math.min(1, castSwingElapsed / 0.42);
    const whip = easeOutCubic(swingT);
    pitch = 0.32 * (1 - whip) - 0.22 * whip;
    roll = -0.06 + whip * 0.04;
    if (castSwingElapsed > 0.42) {
      const settle = Math.min(1, (castSwingElapsed - 0.42) / 0.35);
      pitch *= 1 - settle;
      roll *= 1 - settle;
      pitch += idleSway * settle;
      roll += idleRoll * settle;
    }
  } else if (phase === "waiting") {
    pitch = idleSway * 0.7;
    roll = idleRoll;
    yaw = Math.sin(time * 1.2) * 0.01;
  } else if (phase === "bite") {
    const jolt = Math.sin(time * 22) * 0.06;
    pitch = 0.12 + jolt;
    roll = 0.08 + Math.cos(time * 18) * 0.05;
    offsetZ = Math.sin(time * 20) * 0.012;
  } else if (phase === "fighting") {
    const intensity = 0.35 + tension * 0.55;
    const freq = 6.5 + tension * 5;
    pitch = Math.sin(time * freq) * 0.09 * intensity;
    yaw = Math.sin(time * (freq * 1.17) + 1.2) * 0.07 * intensity;
    roll = Math.cos(time * (freq * 0.93)) * 0.11 * intensity;
    offsetX = Math.sin(time * (freq * 1.4)) * 0.025 * intensity;
    offsetY = Math.cos(time * (freq * 1.1)) * 0.018 * intensity;
    offsetZ = Math.sin(time * (freq * 0.85)) * 0.015 * intensity;
  } else if (phase === "caught") {
    pitch = 0.05 + Math.sin(time * 4) * 0.04;
    roll = 0.06;
  } else if (phase === "escaped") {
    pitch = -0.08 + idleSway;
    roll = idleRoll * 1.5;
  }

  pitch += aimPitch * 0.55;
  yaw += aimYaw;
  if (phase === "fighting") {
    roll += aimYaw * 0.15;
  }

  return { pitch, yaw, roll, offsetX, offsetY, offsetZ };
}
