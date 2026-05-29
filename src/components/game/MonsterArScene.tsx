/**
 * Three.js 기반 카메라 합성 AR 씬 — "숨어있다 발견된다" 게임플레이용.
 *
 * 디자인 의도:
 *  - 몬스터는 항상 화면에서 충분히 크게 보이도록 *렌더 깊이* 를 고정한다 (3m).
 *    실제 GPS 거리는 "스케일" 에만 반영. 100m 떨어진 몬스터라도 화면에서 인지될
 *    크기를 유지해야 게임이 성립한다.
 *  - 사용자의 폰 방향이 몬스터 방위와 얼마나 일치하는지 aimScore 로 계산한다.
 *    aimScore 가 낮으면 (looking away) → "숨김" 상태: 작고 반투명, 미세 파티클만.
 *    aimScore 가 임계 넘으면 → "발견" 상태: 풀 사이즈/풀 컬러, notice 애니메이션
 *    (점프, 카메라로 고개 돌리기, 파티클 분사) 트리거.
 *  - 발견 후 사용자가 다시 시선을 돌리면 부드럽게 숨김으로 복귀.
 *  - 명중 시: 파티클 폭발, 카메라 셰이크, 사운드, 진동, 넉백, 스케일 punch, 결정타 시퀀스.
 *
 * 한계:
 *  - 진짜 환경 occlusion (앞에 사물이 있으면 가려짐) 은 웹에서 불가. 대신 "noticed
 *    되어야만 등장" 메커닉으로 발견의 재미를 흉내낸다.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { MonsterRarity } from "@/lib/game/monsters";
import { bearingDelta } from "@/lib/game/geo";
import { fx } from "@/lib/game/fx";
import { anchorLerpFactor, computeGroundScreenY, screenYToWorldY } from "@/lib/ar/groundAnchor";

type Orientation = { x: number; y: number };

export interface MonsterArSceneProps {
  monsterKey: string;
  rarity: MonsterRarity;
  hits: number;
  hitsRequired: number;
  orientation: Orientation;
  onAim: (hit: boolean, screenX: number, screenY: number) => void;
  monsterName?: string;

  /** 사용자→몬스터 방위각 0~360°. */
  bearingDeg?: number;
  /** 나침반−몬스터 방위 차이(°). 제공 시 씬 배치·aimScore 에 우선 사용. */
  bearingDeltaDeg?: number | null;
  /** 사용자→몬스터 거리(m). 스케일에만 영향. */
  distanceM?: number;
  /** 디바이스 나침반 방위. null이면 정면 가정. */
  compassHeading?: number | null;

  /**
   * 객체 인식 기반 스크린 앵커. 정규화된 좌표 (0..1) + 박스 크기.
   * 제공되면 bearing-based 위치를 이쪽으로 부드럽게 끌어당겨 "이 객체 위에
   * 앉아있는 듯한" 느낌을 만든다. null 이면 bearing-only.
   */
  screenAnchor?: { x: number; y: number; size: number; category?: string } | null;

  /** 카메라 pitch (rad) — 지면 Y 추정 */
  devicePitchRad?: number | null;

  /** aimScore 0..1 변경 시 (HUD 판정용) */
  onAimScoreChange?: (score: number) => void;

  /** 조우 중 몬스터 항상 표시 (walking 중 숨김) */
  forceVisible?: boolean;

  /**
   * AI 생성 몬스터 GLB URL. 제공되면 기본 기하 도형 body 를 숨기고
   * 이 GLB 를 합성한다. 눈/그림자/halo 는 그대로 유지.
   */
  glbUrl?: string | null;
}

const RARITY_COLOR: Record<MonsterRarity, number> = {
  common: 0x86d68a,
  rare: 0x60a5fa,
  legendary: 0xfbbf24,
};
const RARITY_EMISSIVE: Record<MonsterRarity, number> = {
  common: 0x224422,
  rare: 0x14283f,
  legendary: 0x4a3408,
};
const RARITY_PARTICLE: Record<MonsterRarity, number> = {
  common: 0xa7f3d0,
  rare: 0xa5b4fc,
  legendary: 0xfde68a,
};

// 렌더 깊이 — 모든 몬스터는 시각적으로 이 거리에 있는 것처럼 그린다.
const RENDER_DEPTH = 3.2;

// 거리(m) → 시각 스케일. 가까울수록 크게, 멀어도 인지할 수 있는 최소 크기 유지.
function distanceToScale(distM: number): number {
  // 5m 미만은 거의 같은 크기로, 100m+는 작아지되 0.6 미만으로 내려가지 않게.
  const s = 2.0 * Math.pow(10 / Math.max(5, distM), 0.45);
  return Math.max(0.6, Math.min(2.4, s));
}

// 시야각(도) — PerspectiveCamera vertical FOV 와 매치
const VFOV_DEG = 65;
const MAX_LATERAL_DEG = VFOV_DEG / 2;
// 정중앙 ±이 각도 안쪽이면 100% noticed. 그 밖은 점점 숨김.
const NOTICE_FULL_DEG = 12;
const NOTICE_FADE_DEG = 28;

function aimScoreFromDelta(absDeltaDeg: number): number {
  if (absDeltaDeg <= NOTICE_FULL_DEG) return 1;
  if (absDeltaDeg >= NOTICE_FADE_DEG) return 0;
  return 1 - (absDeltaDeg - NOTICE_FULL_DEG) / (NOTICE_FADE_DEG - NOTICE_FULL_DEG);
}

interface MonsterBundle {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  shadowMat: THREE.MeshBasicMaterial;
  eyeMatL: THREE.MeshBasicMaterial;
  eyeMatR: THREE.MeshBasicMaterial;
  haloMat?: THREE.MeshBasicMaterial;
}

function makeMonsterMesh(rarity: MonsterRarity): MonsterBundle {
  const group = new THREE.Group();
  const color = RARITY_COLOR[rarity];
  const emissive = RARITY_EMISSIVE[rarity];

  let bodyGeom: THREE.BufferGeometry;
  if (rarity === "legendary") bodyGeom = new THREE.IcosahedronGeometry(0.55, 1);
  else if (rarity === "rare") bodyGeom = new THREE.OctahedronGeometry(0.55, 1);
  else bodyGeom = new THREE.SphereGeometry(0.5, 32, 24);

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.5,
    roughness: 0.4,
    metalness: 0.15,
    transparent: true,
    opacity: 1,
    flatShading: rarity !== "common",
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.name = "body";
  group.add(body);

  // 눈
  const eyeMatL = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 1 });
  const eyeMatR = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 1 });
  const eyeGeom = new THREE.SphereGeometry(0.085, 14, 14);
  const eyeL = new THREE.Mesh(eyeGeom, eyeMatL);
  const eyeR = new THREE.Mesh(eyeGeom, eyeMatR);
  eyeL.position.set(-0.18, 0.12, 0.46);
  eyeR.position.set(0.18, 0.12, 0.46);
  group.add(eyeL);
  group.add(eyeR);

  // 그림자
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.42,
  });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 36), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.55;
  shadow.name = "shadow";
  group.add(shadow);

  let haloMat: THREE.MeshBasicMaterial | undefined;
  if (rarity === "legendary") {
    haloMat = new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.7,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 14, 64), haloMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.75;
    ring.name = "halo";
    group.add(ring);
  }

  return { group, bodyMat, shadowMat, eyeMatL, eyeMatR, haloMat };
}

interface ParticleSystem {
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  ages: Float32Array;
  capacity: number;
  material: THREE.PointsMaterial;
}

function makeParticles(capacity: number, size: number): ParticleSystem {
  const positions = new Float32Array(capacity * 3);
  const velocities = new Float32Array(capacity * 3);
  const ages = new Float32Array(capacity);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size,
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geom, material);
  return { points, positions, velocities, ages, capacity, material };
}

export function MonsterArScene({
  monsterKey: _monsterKey,
  rarity,
  hits,
  hitsRequired,
  orientation,
  onAim,
  monsterName,
  bearingDeg: monsterBearing,
  bearingDeltaDeg,
  distanceM,
  compassHeading,
  screenAnchor,
  devicePitchRad,
  onAimScoreChange,
  forceVisible = false,
  glbUrl,
}: MonsterArSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const orientationRef = useRef(orientation);
  orientationRef.current = orientation;
  const compassRef = useRef<number | null>(compassHeading ?? null);
  compassRef.current = compassHeading ?? null;
  const bearingRef = useRef<number | undefined>(monsterBearing);
  bearingRef.current = monsterBearing;
  const bearingDeltaRef = useRef<number | null>(bearingDeltaDeg ?? null);
  bearingDeltaRef.current = bearingDeltaDeg ?? null;
  const distanceRef = useRef<number>(distanceM ?? 10);
  distanceRef.current = distanceM ?? 10;
  const hitsRef = useRef(hits);
  hitsRef.current = hits;
  const requiredRef = useRef(hitsRequired);
  requiredRef.current = hitsRequired;
  const anchorRef = useRef<{ x: number; y: number; size: number; category?: string } | null>(
    screenAnchor ?? null,
  );
  anchorRef.current = screenAnchor ?? null;
  const pitchRef = useRef(devicePitchRad ?? null);
  pitchRef.current = devicePitchRad ?? null;
  const onAimScoreChangeRef = useRef(onAimScoreChange);
  onAimScoreChangeRef.current = onAimScoreChange;
  const forceVisibleRef = useRef(forceVisible);
  forceVisibleRef.current = forceVisible;
  const glbUrlRef = useRef<string | null>(glbUrl ?? null);
  glbUrlRef.current = glbUrl ?? null;

  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    bundle: MonsterBundle;
    burst: ParticleSystem;
    aura: ParticleSystem;
    raycaster: THREE.Raycaster;
    rafId: number;
    clock: THREE.Clock;
    spawnTime: number;
    // 발견 상태
    aimScore: number; // 0..1 부드러운 보간
    discoveredAt: number; // 처음 noticed 된 시각 (애니메이션용)
    // hit 효과
    flashUntilMs: number;
    shakeUntilMs: number;
    knockbackUntilMs: number;
    knockbackVec: THREE.Vector3;
    // 회피
    escapeUntilMs: number;
    escapeOffset: THREE.Vector3;
    nextEscapeAtMs: number;
    anchorStable: number;
    lastReportedAim: number;
    // 결정타
    finishing: boolean;
    finishStartMs: number;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.pointerEvents = "none";

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(VFOV_DEG, width / height, 0.1, 50);
    camera.position.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.95);
    sun.position.set(2, 4, 2);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xa5b4fc, 0.45);
    rim.position.set(-3, -1, -2);
    scene.add(rim);

    const bundle = makeMonsterMesh(rarity);
    scene.add(bundle.group);

    // burst 큰 입자, aura 작은 입자가 항상 떠다님
    const burst = makeParticles(140, 0.09);
    const aura = makeParticles(40, 0.045);
    aura.material.color.setHex(RARITY_PARTICLE[rarity]);
    aura.material.opacity = 0.85;
    scene.add(burst.points);
    scene.add(aura.points);

    const raycaster = new THREE.Raycaster();
    const clock = new THREE.Clock();

    stateRef.current = {
      renderer,
      scene,
      camera,
      bundle,
      burst,
      aura,
      raycaster,
      rafId: 0,
      clock,
      spawnTime: performance.now(),
      aimScore: 0,
      discoveredAt: 0,
      flashUntilMs: 0,
      shakeUntilMs: 0,
      knockbackUntilMs: 0,
      knockbackVec: new THREE.Vector3(),
      escapeUntilMs: 0,
      escapeOffset: new THREE.Vector3(),
      nextEscapeAtMs: performance.now() + 7000 + Math.random() * 4000,
      finishing: false,
      finishStartMs: 0,
      anchorStable: 0,
      lastReportedAim: -1,
    };

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    // ── particle emit helpers ─────────────────────────────────
    function emitBurst(count: number, color: number, speed: number) {
      const st = stateRef.current;
      if (!st) return;
      const p = st.burst;
      let emitted = 0;
      for (let i = 0; i < p.capacity && emitted < count; i++) {
        if (p.ages[i] > 0) continue;
        p.positions[i * 3] = st.bundle.group.position.x;
        p.positions[i * 3 + 1] = st.bundle.group.position.y;
        p.positions[i * 3 + 2] = st.bundle.group.position.z;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const s = speed * (0.6 + Math.random() * 0.9);
        p.velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * s;
        p.velocities[i * 3 + 1] = Math.cos(phi) * s + 0.5;
        p.velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * s;
        p.ages[i] = 0.55 + Math.random() * 0.5;
        emitted++;
      }
      p.material.color.setHex(color);
      (p.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    function emitAuraOne(t: number) {
      const st = stateRef.current;
      if (!st) return;
      const p = st.aura;
      for (let i = 0; i < p.capacity; i++) {
        if (p.ages[i] > 0) continue;
        // 몬스터 주위 구면 반경 0.7~1.1 에서 부유
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 0.7 + Math.random() * 0.4;
        p.positions[i * 3] = st.bundle.group.position.x + Math.sin(phi) * Math.cos(theta) * r;
        p.positions[i * 3 + 1] =
          st.bundle.group.position.y + Math.cos(phi) * r * 0.7 + Math.sin(t * 2) * 0.05;
        p.positions[i * 3 + 2] = st.bundle.group.position.z + Math.sin(phi) * Math.sin(theta) * r;
        // 천천히 위로 떠오름
        p.velocities[i * 3] = (Math.random() - 0.5) * 0.05;
        p.velocities[i * 3 + 1] = 0.15 + Math.random() * 0.1;
        p.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
        p.ages[i] = 0.8 + Math.random() * 0.6;
        break;
      }
    }

    let lastAuraEmit = 0;
    let prevNotice = false;

    const animate = () => {
      const st = stateRef.current;
      if (!st) return;
      st.rafId = requestAnimationFrame(animate);

      const now = performance.now();
      const t = (now - st.spawnTime) / 1000;
      const dt = Math.min(0.05, st.clock.getDelta());

      // ── aimScore 계산 ───────────────────────────────────────
      const compass = compassRef.current;
      const bearing = bearingRef.current;
      const deltaFromParent = bearingDeltaRef.current;
      let rawAimScore = 0.35;
      let lateralRad = 0;
      let deltaDeg: number | null = null;
      if (typeof deltaFromParent === "number" && Number.isFinite(deltaFromParent)) {
        deltaDeg = deltaFromParent;
      } else if (typeof compass === "number" && typeof bearing === "number") {
        deltaDeg = bearingDelta(compass, bearing);
      }
      if (deltaDeg != null) {
        const absDelta = Math.abs(deltaDeg);
        rawAimScore = aimScoreFromDelta(absDelta);
        const screenAngleDeg = Math.max(-MAX_LATERAL_DEG, Math.min(MAX_LATERAL_DEG, deltaDeg));
        lateralRad = (screenAngleDeg * Math.PI) / 180;
      } else {
        lateralRad = (orientationRef.current.x / 900) * Math.PI;
      }
      // aimScore 부드럽게 (5fps 정도로 변화)
      st.aimScore += (rawAimScore - st.aimScore) * Math.min(1, dt * 6);
      if (forceVisibleRef.current) {
        st.aimScore = Math.max(st.aimScore, 0.85);
      }
      if (
        onAimScoreChangeRef.current &&
        Math.abs(st.aimScore - st.lastReportedAim) > 0.04
      ) {
        st.lastReportedAim = st.aimScore;
        onAimScoreChangeRef.current(st.aimScore);
      }

      const noticed = st.aimScore >= 0.55;
      if (noticed && !prevNotice && !st.finishing) {
        // 처음 발견 — notice 효과
        st.discoveredAt = now;
        emitBurst(20, RARITY_PARTICLE[rarity], 1.2);
        // 짧고 부드러운 발견 톤
        fx.hit();
      }
      prevNotice = noticed;

      // ── 몬스터 위치 (렌더 깊이는 고정) ─────────────────────
      let baseX = Math.sin(lateralRad) * RENDER_DEPTH;
      let baseZ = -Math.cos(lateralRad) * RENDER_DEPTH;
      let baseYBias = 0;

      // 객체 인식 anchor 가 제공되면 bearing-based 위치를 그쪽으로 lerp.
      // anchor.x/y 는 0..1 정규화 좌표 (0=좌상, 1=우하).
      // 카메라 시야 가운데(0.5, 0.5) 가 z=-RENDER_DEPTH 정중앙에 대응.
      const anchor = anchorRef.current;
      if (anchor) {
        st.anchorStable = Math.min(12, st.anchorStable + 1);
      } else {
        st.anchorStable = Math.max(0, st.anchorStable - 1);
      }
      const lerpK = anchorLerpFactor(st.anchorStable);

      if (anchor) {
        const fovRad = (VFOV_DEG * Math.PI) / 180;
        const halfWidthAtDepth = Math.tan(fovRad / 2) * RENDER_DEPTH;
        const anchorXWorld = (anchor.x - 0.5) * 2 * halfWidthAtDepth;
        const anchorYWorld = (0.5 - anchor.y) * 2 * halfWidthAtDepth * 0.85;
        baseX += (anchorXWorld - baseX) * lerpK;
        baseYBias += (anchorYWorld - baseYBias) * lerpK;
      }

      const groundScreenY = computeGroundScreenY({
        pitchRad: pitchRef.current,
        anchorTopY: anchor ? anchor.y - anchor.size / 2 : undefined,
        anchorCategory: anchor?.category,
      });
      const groundY = screenYToWorldY(groundScreenY, RENDER_DEPTH, VFOV_DEG);
      const bodyHalfHeight = 0.55 * distanceToScale(distanceRef.current);

      const hoverY = baseYBias + Math.sin(t * 2.0) * 0.03;

      // 숨김 상태에선 약간 아래로 가라앉음 (peek-a-boo)
      const hideDip = (1 - st.aimScore) * -0.35;

      // 넉백
      let kx = 0,
        ky = 0,
        kz = 0;
      if (now < st.knockbackUntilMs) {
        const k = (st.knockbackUntilMs - now) / 220;
        kx = st.knockbackVec.x * k;
        ky = st.knockbackVec.y * k;
        kz = st.knockbackVec.z * k;
      }

      // 회피 dart — noticed 상태에서, 첫 hit 이후
      if (now < st.escapeUntilMs) {
        const k = (st.escapeUntilMs - now) / 600;
        const ease = 1 - (1 - k) * (1 - k);
        kx += st.escapeOffset.x * ease;
        ky += st.escapeOffset.y * ease;
      } else if (
        now >= st.nextEscapeAtMs &&
        !st.finishing &&
        noticed &&
        hitsRef.current > 0 &&
        hitsRef.current < requiredRef.current
      ) {
        st.escapeUntilMs = now + 600;
        st.escapeOffset.set(
          (Math.random() - 0.5) * 1.4,
          (Math.random() - 0.2) * 0.4,
          0,
        );
        st.nextEscapeAtMs = now + 5000 + Math.random() * 5000;
      }

      st.bundle.group.position.set(
        baseX + kx,
        groundY + bodyHalfHeight + hoverY + hideDip + ky,
        baseZ + kz,
      );

      // 카메라를 향해 lookAt + 약간의 idle 회전 (noticed 일 때만 자기축 빠른 회전)
      st.bundle.group.lookAt(st.camera.position.x, st.bundle.group.position.y + 0.15, st.camera.position.z);
      st.bundle.group.rotateY(t * (noticed ? 0.7 : 0.2));

      // ── 스케일: 실제 거리 + aimScore + hit punch + finish shrink ──
      const distScale = distanceToScale(distanceRef.current);
      const visibility = 0.45 + st.aimScore * 0.55; // 0.45 (숨김) ~ 1.0 (등장)

      const sincePunch = Math.max(0, 1 - (now - st.flashUntilMs + 180) / 180);
      const punch = 1 + sincePunch * 0.22;
      const progressShrink = 1 - 0.12 * (hitsRef.current / Math.max(1, requiredRef.current));

      let scale = distScale * visibility * punch * progressShrink;
      if (st.finishing) {
        const dur = (now - st.finishStartMs) / 1000;
        scale *= Math.max(0.04, 1 - dur * 1.4);
        st.bundle.group.rotateY(dur * 7);
        if (dur > 0.7) st.bundle.group.visible = false;
      }
      st.bundle.group.scale.setScalar(scale);

      // ── 시각 properties: opacity / emissive ────────────────
      // 숨김 → 반투명 + 어두움. 등장 → 풀 컬러 + 강한 발광.
      const opacity = 0.25 + st.aimScore * 0.75;
      st.bundle.bodyMat.opacity = opacity;
      st.bundle.eyeMatL.opacity = opacity;
      st.bundle.eyeMatR.opacity = opacity;
      st.bundle.shadowMat.opacity = 0.18 + st.aimScore * 0.3;
      if (st.bundle.haloMat) st.bundle.haloMat.opacity = 0.2 + st.aimScore * 0.55;

      const baseEmissive = 0.4 + st.aimScore * 0.5;
      if (now < st.flashUntilMs) {
        const k = (st.flashUntilMs - now) / 180;
        st.bundle.bodyMat.emissiveIntensity = baseEmissive + k * 1.6;
      } else {
        st.bundle.bodyMat.emissiveIntensity = baseEmissive;
      }

      // halo 회전
      if (st.bundle.haloMat) {
        const halo = st.bundle.group.getObjectByName("halo");
        if (halo) halo.rotation.z = t * 1.5;
      }

      // ── 카메라 셰이크 ───────────────────────────────────────
      let camOffsetX = 0,
        camOffsetY = 0;
      if (now < st.shakeUntilMs) {
        const k = (st.shakeUntilMs - now) / 220;
        camOffsetX = (Math.random() - 0.5) * 0.08 * k;
        camOffsetY = (Math.random() - 0.5) * 0.08 * k;
      }
      const tiltX = orientationRef.current.x / 1200;
      const tiltY = orientationRef.current.y / 1400;
      st.camera.position.set(camOffsetX, camOffsetY, 0);
      st.camera.rotation.set(tiltY * 0.15, tiltX * 0.15, 0);

      // ── 파티클 업데이트 ─────────────────────────────────────
      // burst
      let burstAlive = false;
      const bp = st.burst;
      for (let i = 0; i < bp.capacity; i++) {
        if (bp.ages[i] <= 0) continue;
        burstAlive = true;
        bp.ages[i] -= dt;
        bp.velocities[i * 3 + 1] -= 4.5 * dt;
        bp.velocities[i * 3] *= 0.96;
        bp.velocities[i * 3 + 2] *= 0.96;
        bp.positions[i * 3] += bp.velocities[i * 3] * dt;
        bp.positions[i * 3 + 1] += bp.velocities[i * 3 + 1] * dt;
        bp.positions[i * 3 + 2] += bp.velocities[i * 3 + 2] * dt;
        if (bp.ages[i] <= 0) {
          bp.positions[i * 3 + 1] = -1000;
        }
      }
      if (burstAlive) {
        (bp.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        bp.material.opacity = 1;
      } else {
        bp.material.opacity = 0;
      }

      // aura: 등장 시 자주, 숨김 시 띄엄띄엄 emit
      const auraInterval = noticed ? 0.05 : 0.25;
      if (now - lastAuraEmit > auraInterval * 1000) {
        emitAuraOne(t);
        lastAuraEmit = now;
      }
      const ap = st.aura;
      let auraAlive = false;
      for (let i = 0; i < ap.capacity; i++) {
        if (ap.ages[i] <= 0) continue;
        auraAlive = true;
        ap.ages[i] -= dt;
        ap.positions[i * 3] += ap.velocities[i * 3] * dt;
        ap.positions[i * 3 + 1] += ap.velocities[i * 3 + 1] * dt;
        ap.positions[i * 3 + 2] += ap.velocities[i * 3 + 2] * dt;
        if (ap.ages[i] <= 0) ap.positions[i * 3 + 1] = -1000;
      }
      if (auraAlive) {
        (ap.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        // 숨김일수록 약간 진하게 (위치 hint), 등장이면 부드럽게
        ap.material.opacity = noticed ? 0.55 : 0.85;
      } else {
        ap.material.opacity = 0;
      }

      st.renderer.render(st.scene, st.camera);
    };
    animate();

    (stateRef.current as unknown as { _emitBurst?: typeof emitBurst })._emitBurst = emitBurst;

    return () => {
      const st = stateRef.current;
      if (st) {
        cancelAnimationFrame(st.rafId);
        st.renderer.dispose();
        try {
          container.removeChild(renderer.domElement);
        } catch {
          /* detached */
        }
      }
      ro.disconnect();
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rarity]);

  // ── AI 생성 GLB 로드 & 기본 body 교체 ────────────────────────
  const loadedGlbUrlRef = useRef<string | null>(null);
  const glbGroupRef = useRef<THREE.Group | null>(null);
  useEffect(() => {
    if (!glbUrl) return;
    if (loadedGlbUrlRef.current === glbUrl) return;
    const st = stateRef.current;
    if (!st) return;
    const loader = new GLTFLoader();
    let cancelled = false;
    loader.load(
      glbUrl,
      (gltf) => {
        if (cancelled) return;
        const st2 = stateRef.current;
        if (!st2) return;
        // 기존 GLB 가 있었으면 제거
        if (glbGroupRef.current) {
          st2.bundle.group.remove(glbGroupRef.current);
          glbGroupRef.current = null;
        }
        // 기본 body 메시 숨김 (이름='body')
        const body = st2.bundle.group.getObjectByName("body");
        if (body) body.visible = false;
        // GLB scene 을 body 자리에 추가
        const g = gltf.scene;
        const box = new THREE.Box3().setFromObject(g);
        const sizeVec = new THREE.Vector3();
        box.getSize(sizeVec);
        const center = new THREE.Vector3();
        box.getCenter(center);
        g.position.sub(center);
        const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
        const scale = 1.0 / Math.max(0.01, maxDim);
        g.scale.setScalar(scale);
        st2.bundle.group.add(g);
        glbGroupRef.current = g;
        loadedGlbUrlRef.current = glbUrl;
      },
      undefined,
      (err) => console.warn("[MonsterArScene] GLB load failed", err),
    );
    return () => {
      cancelled = true;
    };
  }, [glbUrl]);

  // ── 명중 reaction ────────────────────────────────────────────
  const lastHitsRef = useRef(0);
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    if (hits > lastHitsRef.current) {
      const now = performance.now();
      st.flashUntilMs = now + 180;
      st.shakeUntilMs = now + 220;
      const angle = Math.atan2(st.bundle.group.position.x, -st.bundle.group.position.z);
      st.knockbackVec.set(Math.sin(angle) * 0.7, 0.25, -Math.cos(angle) * 0.7);
      st.knockbackUntilMs = now + 220;
      const color = RARITY_PARTICLE[rarity];
      const emit = (st as unknown as { _emitBurst?: (n: number, c: number, s: number) => void })
        ._emitBurst;
      emit?.(32, color, 1.6);
      if (hits >= hitsRequired) {
        st.finishing = true;
        st.finishStartMs = now;
        emit?.(100, 0xffffff, 2.6);
        fx.finish();
      } else {
        fx.hit();
      }
    }
    lastHitsRef.current = hits;
  }, [hits, hitsRequired, rarity]);

  // ── 탭 → raycast ─────────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = stateRef.current;
    const container = containerRef.current;
    if (!st || !container) return;
    if (st.finishing) return;
    // 숨김 상태에선 raycaster hit 도 부정확 — aimScore 가 낮으면 hit 처리 거부.
    if (st.aimScore < 0.5) {
      fx.miss();
      onAim(false, e.clientX, e.clientY);
      return;
    }
    const rect = container.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    st.raycaster.setFromCamera(new THREE.Vector2(nx, ny), st.camera);
    const intersects = st.raycaster.intersectObject(st.bundle.group, true);
    const hit = intersects.length > 0;
    if (!hit) fx.miss();
    onAim(hit, e.clientX, e.clientY);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      className="absolute inset-0"
      style={{ touchAction: "none" }}
      aria-label={monsterName ? `${monsterName} AR 씬` : "몬스터 AR 씬"}
    />
  );
}
