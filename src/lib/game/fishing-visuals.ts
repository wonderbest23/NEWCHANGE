/**
 * 낚시 비주얼 공용 상수 + 셰이더 + 헬퍼.
 *
 * 좌표계: 화면 정규화 (0..1). 좌하단 원점, y 위로 +.
 * 모두 OrthographicCamera(0,1,1,0) 기준.
 */

import * as THREE from "three";
import type { FishingPhase } from "./action-context";

// ── 연못 영역 ────────────────────────────────────────────────
/** 연못 타원 중심 (x, y) 화면 좌표 */
export const POND_CENTER = { x: 0.5, y: 0.22 };
/** 연못 가로/세로 반지름 (정규화) — 모바일 가로폭의 약 95% */
export const POND_RADIUS = { rx: 0.47, ry: 0.16 };
/** 연못 가장자리 페더 두께 (smoothstep 폭) */
export const POND_FEATHER = 0.04;

// ── 색상 (너무 파랗지 않게, 카메라 영상 톤과 섞이도록 회색-청록 기조) ──
export const COLOR = {
  pondCore: new THREE.Color("#1e3a55"),
  pondRim: new THREE.Color("#7dd3fc"),
  ripple: new THREE.Color("#bae6fd"),
  splash: new THREE.Color("#e0f2fe"),
  bobberBody: new THREE.Color("#dc2626"),
  bobberTip: new THREE.Color("#fafafa"),
  shadow: new THREE.Color("#0b1220"),
  fishCommon: new THREE.Color("#a3d9a5"),
  fishRare: new THREE.Color("#93c5fd"),
  fishLegendary: new THREE.Color("#fbbf24"),
  plant: new THREE.Color("#3f6212"),
  sparkle: new THREE.Color("#fef9c3"),
};

// ── 셰이더: 페더드 알파 타원 연못 ─────────────────────────────
// 가장자리에서 알파가 부드럽게 사라지며, 시간에 따라 surface 가 미세하게 출렁임.
export const POND_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const POND_FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uCore;
  uniform vec3 uRim;
  uniform float uOpacity;

  // 단순 noise (저렴) — 표면 출렁임용
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  void main() {
    // 0..1 uv 를 -1..1 로
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);

    // smoothstep 으로 페더드 가장자리
    float feather = 0.08;
    float alpha = 1.0 - smoothstep(1.0 - feather, 1.0, r);
    if (alpha <= 0.0) discard;

    // 가장자리 빛 (rim)
    float rim = smoothstep(0.72, 0.96, r) * (1.0 - smoothstep(0.96, 1.02, r));

    // 표면 출렁임 (미세, 모바일 부담 최소)
    float n = noise(p * 5.0 + vec2(uTime * 0.18, uTime * 0.14)) * 0.06;
    n += noise(p * 12.0 + vec2(-uTime * 0.22, uTime * 0.18)) * 0.04;

    vec3 col = mix(uCore + n, uRim, rim * 0.55);
    gl_FragColor = vec4(col, alpha * uOpacity);
  }
`;

// ── Rarity → 물고기 그림자 spec ───────────────────────────────
export interface ShadowSpec {
  rx: number; // 반지름 x
  ry: number; // 반지름 y
  speed: number; // 좌우 진동 빈도
  amplitude: number; // 좌우 진동 폭
  baseAlpha: number; // 그림자 진하기
}

export function shadowSpecFor(
  rarity: "common" | "rare" | "legendary",
): ShadowSpec {
  switch (rarity) {
    case "legendary":
      return { rx: 0.075, ry: 0.025, speed: 1.4, amplitude: 0.13, baseAlpha: 0.55 };
    case "rare":
      return { rx: 0.055, ry: 0.018, speed: 1.8, amplitude: 0.1, baseAlpha: 0.45 };
    default:
      return { rx: 0.04, ry: 0.013, speed: 1.0, amplitude: 0.06, baseAlpha: 0.4 };
  }
}

// ── Phase 별 splash 스펙 ──────────────────────────────────────
export interface SplashSpec {
  count: number;
  speedMin: number;
  speedMax: number;
  lifetimeMin: number;
  lifetimeMax: number;
  color: THREE.Color;
  size: number;
}

export function splashSpecFor(
  kind: "cast_land" | "bite" | "hook" | "caught" | "escaped",
): SplashSpec {
  switch (kind) {
    case "cast_land":
      return { count: 24, speedMin: 0.04, speedMax: 0.12, lifetimeMin: 0.35, lifetimeMax: 0.6, color: COLOR.splash, size: 0.012 };
    case "bite":
      return { count: 14, speedMin: 0.025, speedMax: 0.07, lifetimeMin: 0.3, lifetimeMax: 0.45, color: COLOR.splash, size: 0.01 };
    case "hook":
      return { count: 40, speedMin: 0.06, speedMax: 0.16, lifetimeMin: 0.45, lifetimeMax: 0.7, color: COLOR.splash, size: 0.014 };
    case "caught":
      return { count: 80, speedMin: 0.08, speedMax: 0.22, lifetimeMin: 0.6, lifetimeMax: 0.95, color: COLOR.splash, size: 0.016 };
    case "escaped":
      return { count: 8, speedMin: 0.02, speedMax: 0.05, lifetimeMin: 0.25, lifetimeMax: 0.4, color: COLOR.splash, size: 0.009 };
  }
}

// ── Phase 별 ripple 스펙 ──────────────────────────────────────
export interface RippleEmitSpec {
  intervalMs: number;
  maxAlive: number;
  /** 가장자리 ring 두께 (정규화) */
  thickness: number;
  /** ring 최대 확장 배수 (1=원본 크기) */
  maxScale: number;
  /** ring 수명 (ms) */
  durationMs: number;
}

export function rippleSpecFor(phase: FishingPhase): RippleEmitSpec {
  switch (phase) {
    case "waiting":
      return { intervalMs: 1500, maxAlive: 4, thickness: 0.005, maxScale: 7, durationMs: 1900 };
    case "bite":
      return { intervalMs: 350, maxAlive: 6, thickness: 0.006, maxScale: 9, durationMs: 1400 };
    case "fighting":
      return { intervalMs: 600, maxAlive: 5, thickness: 0.005, maxScale: 6, durationMs: 1600 };
    default:
      return { intervalMs: 0, maxAlive: 0, thickness: 0, maxScale: 0, durationMs: 0 };
  }
}

// ── 연못 안 랜덤 좌표 (가장자리에서 살짝 안쪽) ────────────────
export function randomPondPoint(): { x: number; y: number } {
  // 가장자리에서 안쪽 80% 영역에 랜덤
  const theta = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * 0.85; // 균등 면적 분포
  return {
    x: POND_CENTER.x + Math.cos(theta) * POND_RADIUS.rx * r,
    y: POND_CENTER.y + Math.sin(theta) * POND_RADIUS.ry * r,
  };
}

// ── 연못 가장자리 (각도 기반) 좌표 ────────────────────────────
export function pondEdgePoint(angleRad: number, inset = 0): { x: number; y: number } {
  return {
    x: POND_CENTER.x + Math.cos(angleRad) * POND_RADIUS.rx * (1 - inset),
    y: POND_CENTER.y + Math.sin(angleRad) * POND_RADIUS.ry * (1 - inset),
  };
}

// ── 햅틱 vibrate (지원 환경만) ────────────────────────────────
export function vibratePattern(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  try {
    nav.vibrate?.(pattern);
  } catch {
    /* noop */
  }
}
