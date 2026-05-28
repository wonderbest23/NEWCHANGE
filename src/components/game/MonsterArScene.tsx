/**
 * Three.js 기반 카메라 합성 AR 씬.
 *
 * 핵심 개선:
 *  - 월드 앵커링: 몬스터가 화면 정가운데에 고정되지 않고, 사용자 GPS 와 나침반
 *    방위각에 따라 실제 환경의 한 방향에 "놓여있다". 폰을 돌리면 몬스터가
 *    시야에 들어왔다 나갔다 한다.
 *  - 거리감/원근감: 거리가 멀수록 작게, 가까울수록 크게. 바닥 그림자 disc 와
 *    살짝 떠 있는 호버 애니메이션으로 "땅에 있는 느낌".
 *  - 타격감: 명중 시 파티클 폭발 + 카메라 셰이크 + 색·스케일 punch + knockback.
 *  - 회피 행동: 무작위로 살짝 옆으로 dart 해 사용자가 다시 조준해야 함.
 *  - 결정타: 점점 빨라지는 회전 + 휘광 + 폭발 파티클 + 화면 플래시 후 카메라 외부에서 fade.
 *
 * 사용처는 onAim(hit:bool, x, y) 콜백으로 명중 카운트를 관리. 화면 외부에서
 * hits 가 변할 때 본 컴포넌트는 hit reaction 을 트리거.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { MonsterRarity } from "@/lib/game/monsters";
import { bearingDelta } from "@/lib/game/geo";
import { fx } from "@/lib/game/fx";

type Orientation = { x: number; y: number };

export interface MonsterArSceneProps {
  monsterKey: string;
  rarity: MonsterRarity;
  hits: number;
  hitsRequired: number;
  orientation: Orientation;
  onAim: (hit: boolean, screenX: number, screenY: number) => void;
  monsterName?: string;

  /** 사용자 위치에서 몬스터를 바라보는 방위각(0~360°). 없으면 정면 가정. */
  bearingDeg?: number;
  /** 사용자→몬스터 거리(m). 없으면 8m 가정 (원근 스케일링용). */
  distanceM?: number;
  /** 디바이스 나침반 방위 (0~360°). null이면 fallback (몬스터 화면 정면 고정). */
  compassHeading?: number | null;
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

const HORIZONTAL_FOV_DEG = 60;
// 화면 폭 절반에 해당하는 월드 x 거리는 distance * tan(HFOV/2).

function makeMonsterMesh(rarity: MonsterRarity): {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  haloMat?: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();

  const color = RARITY_COLOR[rarity];
  const emissive = RARITY_EMISSIVE[rarity];

  let bodyGeom: THREE.BufferGeometry;
  if (rarity === "legendary") {
    bodyGeom = new THREE.IcosahedronGeometry(0.55, 1);
  } else if (rarity === "rare") {
    bodyGeom = new THREE.OctahedronGeometry(0.55, 1);
  } else {
    bodyGeom = new THREE.SphereGeometry(0.5, 28, 22);
  }
  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.45,
    roughness: 0.45,
    metalness: 0.15,
    flatShading: rarity !== "common",
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.name = "body";
  group.add(body);

  // 눈
  const eyeGeom = new THREE.SphereGeometry(0.08, 12, 12);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeL = new THREE.Mesh(eyeGeom, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeom, eyeMat);
  eyeL.position.set(-0.18, 0.12, 0.46);
  eyeR.position.set(0.18, 0.12, 0.46);
  group.add(eyeL);
  group.add(eyeR);

  // 바닥 그림자 disc — 몬스터 아래 살짝 떠있는 듯한 느낌
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 32),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
    }),
  );
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
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.045, 12, 56), haloMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.7;
    ring.name = "halo";
    group.add(ring);
  }

  return { group, bodyMat, haloMat };
}

// 파티클 시스템 — 명중 시 색·크기 다르게 spawn
function makeParticles(): {
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  ages: Float32Array;
  capacity: number;
  material: THREE.PointsMaterial;
} {
  const capacity = 120;
  const positions = new Float32Array(capacity * 3);
  const velocities = new Float32Array(capacity * 3);
  const ages = new Float32Array(capacity); // 0=dead, >0=remaining seconds
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size: 0.08,
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
  distanceM,
  compassHeading,
}: MonsterArSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const orientationRef = useRef(orientation);
  orientationRef.current = orientation;
  const compassRef = useRef<number | null>(compassHeading ?? null);
  compassRef.current = compassHeading ?? null;
  const bearingRef = useRef<number | undefined>(monsterBearing);
  bearingRef.current = monsterBearing;
  const distanceRef = useRef<number>(distanceM ?? 8);
  distanceRef.current = distanceM ?? 8;
  const hitsRef = useRef(hits);
  hitsRef.current = hits;
  const requiredRef = useRef(hitsRequired);
  requiredRef.current = hitsRequired;

  const sceneStateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    monster: THREE.Group;
    bodyMat: THREE.MeshStandardMaterial;
    haloMat?: THREE.MeshBasicMaterial;
    particles: ReturnType<typeof makeParticles>;
    raycaster: THREE.Raycaster;
    rafId: number;
    clock: THREE.Clock;
    spawnTime: number;
    // 몬스터의 월드 위치 anchor (사용자가 정면을 향한 시점 기준).
    anchorAngleRad: number; // 0=정면, +=오른쪽, −=왼쪽 (compass 가 없을 때만 사용)
    // hit reaction state
    flashUntilMs: number;
    knockbackUntilMs: number;
    knockbackVec: THREE.Vector3;
    shakeUntilMs: number;
    // escape dart state
    escapeUntilMs: number;
    escapeOffset: THREE.Vector3;
    nextEscapeAtMs: number;
    // capture/final state
    finishing: boolean;
    finishStartMs: number;
    onCompleteFade: (() => void) | null;
  } | null>(null);

  // ── mount once ───────────────────────────────────────────────
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

    const camera = new THREE.PerspectiveCamera(HORIZONTAL_FOV_DEG, width / height, 0.1, 60);
    // 카메라 위치는 (0,1.5,0) 인간 눈높이 가정. 몬스터는 거리에 따라 z 음수 방향에 배치.
    camera.position.set(0, 1.5, 0);

    // 조명
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.85);
    sun.position.set(2, 4, 2);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9ca3ff, 0.4);
    rim.position.set(-3, -1, -2);
    scene.add(rim);

    const { group: monster, bodyMat, haloMat } = makeMonsterMesh(rarity);
    scene.add(monster);

    const particles = makeParticles();
    scene.add(particles.points);

    const raycaster = new THREE.Raycaster();
    const clock = new THREE.Clock();

    const initialDistance = distanceRef.current;
    monster.position.set(0, 1.2, -initialDistance);

    sceneStateRef.current = {
      renderer,
      scene,
      camera,
      monster,
      bodyMat,
      haloMat,
      particles,
      raycaster,
      rafId: 0,
      clock,
      spawnTime: performance.now(),
      anchorAngleRad: 0,
      flashUntilMs: 0,
      knockbackUntilMs: 0,
      knockbackVec: new THREE.Vector3(),
      shakeUntilMs: 0,
      escapeUntilMs: 0,
      escapeOffset: new THREE.Vector3(),
      nextEscapeAtMs: performance.now() + 4000 + Math.random() * 3000,
      finishing: false,
      finishStartMs: 0,
      onCompleteFade: null,
    };

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    function emitParticles(count: number, color: number, speed = 1.2) {
      const st = sceneStateRef.current;
      if (!st) return;
      const p = st.particles;
      let emitted = 0;
      for (let i = 0; i < p.capacity && emitted < count; i++) {
        if (p.ages[i] > 0) continue;
        const px = st.monster.position.x;
        const py = st.monster.position.y;
        const pz = st.monster.position.z;
        p.positions[i * 3] = px;
        p.positions[i * 3 + 1] = py;
        p.positions[i * 3 + 2] = pz;
        // 구면 분포로 속도
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const s = speed * (0.6 + Math.random() * 0.8);
        p.velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * s;
        p.velocities[i * 3 + 1] = Math.cos(phi) * s + 0.5; // 위쪽 보정
        p.velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * s;
        p.ages[i] = 0.6 + Math.random() * 0.5;
        emitted++;
      }
      p.material.color.setHex(color);
      (p.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    (sceneStateRef.current as unknown as { _emit?: typeof emitParticles })._emit = emitParticles;

    const animate = () => {
      const st = sceneStateRef.current;
      if (!st) return;
      st.rafId = requestAnimationFrame(animate);

      const now = performance.now();
      const t = (now - st.spawnTime) / 1000;
      const dt = Math.min(0.05, st.clock.getDelta());

      // ── 카메라 회전 & 몬스터 위치 ─────────────────────────────
      // compass 가 있으면: 몬스터를 월드 방위에 anchoring → 카메라 (heading) 회전에 따라
      // 자연스럽게 시야에서 좌우로 이동.
      const compass = compassRef.current;
      const bearing = bearingRef.current;
      const dist = distanceRef.current;

      let angleFromCenterRad = 0;
      if (typeof compass === "number" && typeof bearing === "number") {
        const delta = bearingDelta(compass, bearing); // -180..180 deg
        angleFromCenterRad = (delta * Math.PI) / 180;
      } else {
        // fallback: orientation.x 픽셀 오프셋을 라디안 추정으로 반전 적용해 미세 시차.
        angleFromCenterRad = (orientationRef.current.x / 600) * Math.PI;
      }

      // 몬스터 월드 위치 = 카메라 정면(z 음수) + 좌우 회전.
      // 시야각(60°) 안에서 자연스럽게 들어왔다 나갔다. 시야 밖이면 안 그려도 되지만,
      // three.js frustum culling 자동 처리.
      const baseX = Math.sin(angleFromCenterRad) * dist;
      const baseZ = -Math.cos(angleFromCenterRad) * dist;

      // hover bob
      const hoverY = 1.2 + Math.sin(t * 2.2) * 0.08;

      // knockback (밀려남)
      let kx = 0,
        ky = 0,
        kz = 0;
      if (now < st.knockbackUntilMs) {
        const k = (st.knockbackUntilMs - now) / 220;
        kx = st.knockbackVec.x * k;
        ky = st.knockbackVec.y * k;
        kz = st.knockbackVec.z * k;
      }

      // escape dart (살짝 옆으로 휙)
      if (now < st.escapeUntilMs) {
        const k = (st.escapeUntilMs - now) / 600;
        const ease = 1 - (1 - k) * (1 - k);
        kx += st.escapeOffset.x * ease;
        ky += st.escapeOffset.y * ease;
      } else if (
        now >= st.nextEscapeAtMs &&
        !st.finishing &&
        hitsRef.current > 0 &&
        hitsRef.current < requiredRef.current
      ) {
        // 한 번 hit 받은 뒤 가끔 도망
        st.escapeUntilMs = now + 600;
        st.escapeOffset.set(
          (Math.random() - 0.5) * 1.6,
          (Math.random() - 0.2) * 0.4,
          0,
        );
        st.nextEscapeAtMs = now + 5000 + Math.random() * 4000;
      }

      st.monster.position.set(baseX + kx, hoverY + ky, baseZ + kz);

      // idle 회전 — 항상 정면을 바라보도록 시점 보정
      st.monster.lookAt(st.camera.position.x, st.monster.position.y + 0.2, st.camera.position.z);
      // 그 위에 살짝 자기축 회전 추가 (visual interest)
      st.monster.rotateY(t * 0.4);

      // 거리 기반 스케일 — 가까우면 크고 멀면 작음. 기본 거리 8m 기준.
      const baseScale = 1.0 * (8 / Math.max(3, dist));
      // hit punch — 명중 직후 잠깐 부풀어 오름
      const sincePunch = Math.max(0, 1 - (now - st.flashUntilMs + 180) / 180);
      const punchScale = 1 + sincePunch * 0.18;
      // 남은 hits 줄어들수록 약간 작아짐 (시각 progress)
      const progressShrink = 1 - 0.15 * (hitsRef.current / Math.max(1, requiredRef.current));

      let scale = baseScale * punchScale * progressShrink;
      if (st.finishing) {
        // 결정타 후 spin & shrink
        const dur = (now - st.finishStartMs) / 1000;
        scale *= Math.max(0.05, 1 - dur * 1.4);
        st.monster.rotateY(dur * 6);
        if (dur > 0.7 && st.onCompleteFade) {
          st.monster.visible = false;
          st.onCompleteFade();
          st.onCompleteFade = null;
        }
      }
      st.monster.scale.setScalar(scale);

      // body material flash
      if (now < st.flashUntilMs) {
        const k = (st.flashUntilMs - now) / 180;
        st.bodyMat.emissiveIntensity = 0.45 + k * 1.5;
      } else {
        st.bodyMat.emissiveIntensity = 0.45;
      }

      // legendary halo rotation
      if (st.haloMat) {
        const halo = st.monster.getObjectByName("halo");
        if (halo) halo.rotation.z = t * 1.4;
      }

      // ── 카메라 셰이크 ────────────────────────────────────────
      let camOffsetX = 0,
        camOffsetY = 0;
      if (now < st.shakeUntilMs) {
        const k = (st.shakeUntilMs - now) / 220;
        camOffsetX = (Math.random() - 0.5) * 0.06 * k;
        camOffsetY = (Math.random() - 0.5) * 0.06 * k;
      }
      // 디바이스 픽셀 기울기도 살짝 카메라에 미세 반영 (배경 패럴랙스)
      const tiltX = orientationRef.current.x / 1200;
      const tiltY = orientationRef.current.y / 1400;
      st.camera.position.set(0 + camOffsetX, 1.5 + camOffsetY, 0);
      st.camera.rotation.set(tiltY, tiltX, 0);

      // ── 파티클 업데이트 ──────────────────────────────────────
      const p = st.particles;
      const pos = p.positions;
      const vel = p.velocities;
      let anyAlive = false;
      for (let i = 0; i < p.capacity; i++) {
        if (p.ages[i] <= 0) continue;
        anyAlive = true;
        p.ages[i] -= dt;
        // 중력 + 마찰
        vel[i * 3 + 1] -= 4.5 * dt;
        vel[i * 3] *= 0.96;
        vel[i * 3 + 2] *= 0.96;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (p.ages[i] <= 0) {
          pos[i * 3] = 0;
          pos[i * 3 + 1] = -1000;
          pos[i * 3 + 2] = 0;
        }
      }
      if (anyAlive) {
        (p.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        const oldestAge = Math.max(...Array.from(p.ages));
        p.material.opacity = Math.min(1, oldestAge / 0.6);
      } else {
        p.material.opacity = 0;
      }

      st.renderer.render(st.scene, st.camera);
    };
    animate();

    return () => {
      const st = sceneStateRef.current;
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
      sceneStateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rarity]);

  // ── hits 변화 감지 → impact reaction ─────────────────────────
  const lastHitsRef = useRef(0);
  useEffect(() => {
    const st = sceneStateRef.current;
    if (!st) return;
    if (hits > lastHitsRef.current) {
      const now = performance.now();
      // flash + shake + knockback + particles + audio + haptic
      st.flashUntilMs = now + 180;
      st.shakeUntilMs = now + 220;
      // 카메라 방향 반대로 살짝 밀려남
      const angle = Math.atan2(st.monster.position.x, -st.monster.position.z);
      st.knockbackVec.set(Math.sin(angle) * 0.6, 0.2, -Math.cos(angle) * 0.6);
      st.knockbackUntilMs = now + 220;
      const color =
        rarity === "legendary" ? 0xfde68a : rarity === "rare" ? 0xa5b4fc : 0xa7f3d0;
      const emit = (st as unknown as { _emit?: (n: number, c: number, s?: number) => void })._emit;
      emit?.(28, color, 1.4);
      if (hits >= hitsRequired) {
        // 결정타
        st.finishing = true;
        st.finishStartMs = now;
        emit?.(80, 0xffffff, 2.4);
        fx.finish();
      } else {
        fx.hit();
      }
    }
    lastHitsRef.current = hits;
  }, [hits, hitsRequired, rarity]);

  // ── 화면 탭 → raycast → onAim ─────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = sceneStateRef.current;
    const container = containerRef.current;
    if (!st || !container) return;
    if (st.finishing) return;
    const rect = container.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    st.raycaster.setFromCamera(new THREE.Vector2(nx, ny), st.camera);
    const intersects = st.raycaster.intersectObject(st.monster, true);
    const hit = intersects.length > 0;
    if (!hit) {
      // 빗나감 — 짧은 톤 + 작은 ripple 파티클을 탭한 화면 지점에서
      fx.miss();
    }
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
