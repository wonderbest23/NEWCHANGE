/**
 * FishingArScene — 카메라 영상 위 AR 낚시터.
 *
 * 비주얼 요소:
 *  - 페더드 알파 타원 연못 (custom ShaderMaterial: 가장자리 부드러움 + 표면 노이즈)
 *  - 라디얼 그라데이션 그림자 (연못 바로 아래 — 카메라와 자연 블렌드)
 *  - 가장자리 sprite (작은 물풀 + 반짝임)
 *  - 동적 물결 ring (페이즈별 빈도/크기)
 *  - 3D 찌 (페이즈별 모션: 호버/딥/끌림)
 *  - 낚싯줄 (낚싯대 → 찌; fighting 중 살짝 흔들림)
 *  - 물고기 그림자 (rarity 별 크기/속도)
 *  - 단계별 splash 파티클 (cast/bite/hook/caught/escaped 각각 다른 패턴)
 *  - 잡힘 컷씬 (placeholder fish → AI GLB swap)
 *
 * 성능 가이드:
 *  - DPR clamp ≤ 2
 *  - Points 단일 버퍼 1개로 splash 통합
 *  - 가장자리 sprite 는 InstancedMesh (16개 미만)
 *  - shader 노이즈는 hash 기반 (텍스처 X)
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { FishingPhase } from "@/lib/game/action-context";
import { fx } from "@/lib/game/fx";
import {
  COLOR,
  POND_CENTER,
  POND_FRAGMENT_SHADER,
  POND_RADIUS,
  POND_VERTEX_SHADER,
  pondEdgePoint,
  rippleSpecFor,
  shadowSpecFor,
  splashSpecFor,
  vibratePattern,
} from "@/lib/game/fishing-visuals";

export interface FishingArSceneProps {
  phase: FishingPhase;
  bobberX: number;
  bobberY: number;
  fishGlbUrl?: string | null;
  fishRarity?: "common" | "rare" | "legendary";
  showCatch?: boolean;
}

interface RippleEntry {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  bornMs: number;
  duration: number;
  maxScale: number;
}

interface SplashParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  max: number;
}

const MAX_SPLASH = 160;

export function FishingArScene(props: FishingArSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const phaseRef = useRef<FishingPhase>(props.phase);
  phaseRef.current = props.phase;
  const bobberRef = useRef({ x: props.bobberX, y: props.bobberY });
  bobberRef.current = { x: props.bobberX, y: props.bobberY };
  const fishGlbUrlRef = useRef<string | null>(props.fishGlbUrl ?? null);
  fishGlbUrlRef.current = props.fishGlbUrl ?? null;
  const showCatchRef = useRef(!!props.showCatch);
  showCatchRef.current = !!props.showCatch;
  const rarityRef = useRef<"common" | "rare" | "legendary">(props.fishRarity ?? "common");
  rarityRef.current = props.fishRarity ?? "common";

  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    pondMat: THREE.ShaderMaterial;
    pondShadowMat: THREE.MeshBasicMaterial;
    bobberGroup: THREE.Group;
    fishShadow: THREE.Mesh;
    sparkleMesh: THREE.InstancedMesh;
    plantMesh: THREE.InstancedMesh;
    ripples: RippleEntry[];
    splashes: SplashParticle[];
    splashPoints: THREE.Points;
    splashPositions: Float32Array;
    splashColors: Float32Array;
    splashSizes: Float32Array;
    splashAttrPos: THREE.BufferAttribute;
    splashAttrCol: THREE.BufferAttribute;
    caughtFishGroup: THREE.Group | null;
    caughtFishStartMs: number;
    prevPhase: FishingPhase;
    bobberAnchorPos: { x: number; y: number };
    biteImpulseAt: number;
    raf: number;
    clock: THREE.Clock;
    lastRippleAt: number;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const W = container.clientWidth || window.innerWidth;
    const H = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.pointerEvents = "none";

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);

    // ── 연못 아래 라디얼 그림자 (카메라와 자연 블렌드) ──
    const pondShadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    const pondShadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 64), pondShadowMat);
    pondShadow.scale.set(1.1, 0.38, 1);
    pondShadow.position.set(POND_CENTER.x, POND_CENTER.y - 0.03, -1.5);
    scene.add(pondShadow);

    // ── 페더드 알파 연못 (shader) ──
    const pondMat = new THREE.ShaderMaterial({
      vertexShader: POND_VERTEX_SHADER,
      fragmentShader: POND_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uCore: { value: COLOR.pondCore },
        uRim: { value: COLOR.pondRim },
        uOpacity: { value: 0.45 },
      },
    });
    const pond = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 32, 32), pondMat);
    pond.scale.set(POND_RADIUS.rx * 2, POND_RADIUS.ry * 2, 1);
    pond.position.set(POND_CENTER.x, POND_CENTER.y, -1);
    scene.add(pond);

    // ── 가장자리 sprite: 물풀 (초록 작은 점) + 반짝임 (노란 작은 점) ──
    const plantCount = 14;
    const plantGeo = new THREE.CircleGeometry(0.006, 8);
    const plantMat = new THREE.MeshBasicMaterial({
      color: COLOR.plant,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const plantMesh = new THREE.InstancedMesh(plantGeo, plantMat, plantCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < plantCount; i++) {
      const angle = (i / plantCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const inset = 0.02 + Math.random() * 0.04;
      const p = pondEdgePoint(angle, -inset); // 가장자리 바깥쪽
      const wob = 1 + Math.random() * 1.5;
      dummy.position.set(p.x, p.y + 0.005, -0.7);
      dummy.scale.set(wob, wob * 1.2, 1);
      dummy.updateMatrix();
      plantMesh.setMatrixAt(i, dummy.matrix);
    }
    scene.add(plantMesh);

    const sparkleCount = 16;
    const sparkleGeo = new THREE.CircleGeometry(0.005, 8);
    const sparkleMat = new THREE.MeshBasicMaterial({
      color: COLOR.sparkle,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const sparkleMesh = new THREE.InstancedMesh(sparkleGeo, sparkleMat, sparkleCount);
    scene.add(sparkleMesh);

    // ── 찌 ──
    const bobberGroup = new THREE.Group();
    const bobBody = new THREE.Mesh(
      new THREE.SphereGeometry(0.013, 20, 16),
      new THREE.MeshBasicMaterial({ color: COLOR.bobberBody }),
    );
    const bobTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.007, 14, 12),
      new THREE.MeshBasicMaterial({ color: COLOR.bobberTip }),
    );
    bobTip.position.y = 0.011;
    bobberGroup.add(bobBody);
    bobberGroup.add(bobTip);
    bobberGroup.position.set(0.5, 0.3, 0);
    bobberGroup.visible = false;
    scene.add(bobberGroup);

    // ── 물고기 그림자 ──
    const fishShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 36),
      new THREE.MeshBasicMaterial({
        color: COLOR.shadow,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    fishShadow.position.set(0.5, 0.2, -0.6);
    scene.add(fishShadow);

    // ── splash particles (단일 Points 버퍼) ──
    const splashPositions = new Float32Array(MAX_SPLASH * 3);
    const splashColors = new Float32Array(MAX_SPLASH * 3);
    const splashSizes = new Float32Array(MAX_SPLASH);
    for (let i = 0; i < MAX_SPLASH; i++) {
      splashPositions[i * 3 + 1] = -10;
      splashSizes[i] = 0.012;
    }
    const splashGeo = new THREE.BufferGeometry();
    const splashAttrPos = new THREE.BufferAttribute(splashPositions, 3);
    const splashAttrCol = new THREE.BufferAttribute(splashColors, 3);
    splashGeo.setAttribute("position", splashAttrPos);
    splashGeo.setAttribute("color", splashAttrCol);
    const splashMat = new THREE.PointsMaterial({
      size: 0.013,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const splashPoints = new THREE.Points(splashGeo, splashMat);
    splashPoints.position.z = -0.3;
    scene.add(splashPoints);

    stateRef.current = {
      renderer,
      scene,
      camera,
      pondMat,
      pondShadowMat,
      bobberGroup,
      fishShadow,
      sparkleMesh,
      plantMesh,
      ripples: [],
      splashes: [],
      splashPoints,
      splashPositions,
      splashColors,
      splashSizes,
      splashAttrPos,
      splashAttrCol,
      caughtFishGroup: null,
      caughtFishStartMs: 0,
      prevPhase: props.phase,
      bobberAnchorPos: { x: props.bobberX, y: props.bobberY },
      biteImpulseAt: 0,
      raf: 0,
      clock: new THREE.Clock(),
      lastRippleAt: 0,
    };

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
    });
    ro.observe(container);

    // ── helpers (closure-locked to state) ─────────────────────
    function emitSplash(kind: "cast_land" | "bite" | "hook" | "caught" | "escaped", at: { x: number; y: number }) {
      const st = stateRef.current!;
      const spec = splashSpecFor(kind);
      for (let i = 0; i < spec.count; i++) {
        if (st.splashes.length >= MAX_SPLASH) break;
        const angle = Math.PI + Math.random() * Math.PI;
        const speed = spec.speedMin + Math.random() * (spec.speedMax - spec.speedMin);
        st.splashes.push({
          x: at.x,
          y: at.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          age: 0,
          max: spec.lifetimeMin + Math.random() * (spec.lifetimeMax - spec.lifetimeMin),
        });
      }
    }

    function emitRipple(at: { x: number; y: number }, phase: FishingPhase) {
      const st = stateRef.current!;
      const spec = rippleSpecFor(phase);
      if (spec.intervalMs === 0) return;
      if (st.ripples.length >= spec.maxAlive) return;
      const mat = new THREE.MeshBasicMaterial({
        color: COLOR.ripple,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.014, 0.014 + spec.thickness, 48),
        mat,
      );
      ring.scale.set(1.6, 0.62, 1);
      ring.position.set(at.x, at.y, -0.4);
      st.scene.add(ring);
      st.ripples.push({
        mesh: ring,
        mat,
        bornMs: performance.now(),
        duration: spec.durationMs,
        maxScale: spec.maxScale,
      });
    }

    function detectPhaseTransition(prev: FishingPhase, next: FishingPhase) {
      // 사용자 손에 닿는 핵심 전환만 effect 발사
      if (prev !== "floating" && next === "floating") {
        emitSplash("cast_land", bobberRef.current);
        emitRipple(bobberRef.current, "waiting");
      }
      if (prev !== "bite" && next === "bite") {
        emitSplash("bite", bobberRef.current);
        emitRipple(bobberRef.current, "bite");
        stateRef.current!.biteImpulseAt = performance.now();
        fx.fishingBite();
      }
      if (prev !== "fighting" && next === "fighting") {
        emitSplash("hook", bobberRef.current);
        emitRipple(bobberRef.current, "fighting");
      }
      if (prev !== "caught" && next === "caught") {
        emitSplash("caught", bobberRef.current);
        fx.fishingCatch();
        // 두 번 더 살짝 진동
        setTimeout(() => vibratePattern([20, 40, 20]), 250);
      }
      if (prev !== "escaped" && next === "escaped") {
        emitSplash("escaped", bobberRef.current);
        fx.fishingEscape();
      }
    }

    let lastBobberAnchor = { ...bobberRef.current };

    const animate = () => {
      const st = stateRef.current;
      if (!st) return;
      st.raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.05, st.clock.getDelta());
      const tt = now / 1000;

      const phase = phaseRef.current;
      const anchor = bobberRef.current;

      // 페이즈 전환 감지
      if (st.prevPhase !== phase) {
        detectPhaseTransition(st.prevPhase, phase);
        st.prevPhase = phase;
      }

      // 연못 셰이더 시간
      st.pondMat.uniforms.uTime.value = tt;

      // sparkle 트윙클 — 시간 따라 알파 변화
      const sparkleMat = st.sparkleMesh.material as THREE.MeshBasicMaterial;
      sparkleMat.opacity = 0.35 + Math.sin(tt * 2.2) * 0.2;
      // sparkle 위치 — 가장자리 안쪽에서 천천히 떠도는 듯
      const dummy = new THREE.Object3D();
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2 + tt * 0.15;
        const r = 0.65 + Math.sin(tt * 0.7 + i) * 0.12;
        const x = POND_CENTER.x + Math.cos(angle) * POND_RADIUS.rx * r;
        const y = POND_CENTER.y + Math.sin(angle) * POND_RADIUS.ry * r * 0.85;
        dummy.position.set(x, y, -0.5);
        const s = 0.7 + 0.5 * Math.sin(tt * 3 + i);
        dummy.scale.setScalar(Math.max(0.4, s));
        dummy.updateMatrix();
        st.sparkleMesh.setMatrixAt(i, dummy.matrix);
      }
      st.sparkleMesh.instanceMatrix.needsUpdate = true;

      // ── 찌 위치 + 페이즈별 모션 ──
      const showBobber =
        phase === "floating" ||
        phase === "waiting" ||
        phase === "bite" ||
        phase === "fighting";
      st.bobberGroup.visible = showBobber;

      if (showBobber) {
        let bx = anchor.x;
        let by = anchor.y;

        if (phase === "waiting") {
          // 천천히 위아래 호버
          by += Math.sin(tt * 1.6) * 0.006;
        } else if (phase === "bite") {
          // 입질 — 강하게 아래로 휙휙
          const since = now - st.biteImpulseAt;
          // 0~400ms 사이에 2~3번 dip
          const dipPhase = (since / 130) % 1;
          const dip = Math.max(0, Math.sin(dipPhase * Math.PI)) * 0.04;
          by -= dip;
          bx += (Math.random() - 0.5) * 0.008;
        } else if (phase === "fighting") {
          // 좌우로 끌려다님
          bx += Math.sin(tt * 4.5) * 0.04;
          by += Math.sin(tt * 6.5) * 0.012;
        }

        st.bobberGroup.position.set(bx, by, 0);
      }

      // ── 물결 자동 emit ──
      const spec = rippleSpecFor(phase);
      if (spec.intervalMs > 0 && showBobber) {
        if (now - st.lastRippleAt > spec.intervalMs) {
          emitRipple({ x: anchor.x, y: anchor.y }, phase);
          st.lastRippleAt = now;
        }
      }

      // ── 물결 update ──
      for (let i = st.ripples.length - 1; i >= 0; i--) {
        const r = st.ripples[i];
        const age = (now - r.bornMs) / r.duration;
        if (age >= 1) {
          st.scene.remove(r.mesh);
          r.mat.dispose();
          r.mesh.geometry.dispose();
          st.ripples.splice(i, 1);
          continue;
        }
        const s = 1 + age * r.maxScale;
        r.mesh.scale.set(1.6 * s, 0.62 * s, 1);
        r.mat.opacity = 0.85 * (1 - age) * (1 - age);
      }

      // ── 물고기 그림자 ──
      const shadowSpec = shadowSpecFor(rarityRef.current);
      const shadowMat = st.fishShadow.material as THREE.MeshBasicMaterial;
      st.fishShadow.scale.set(shadowSpec.rx / 0.04, shadowSpec.ry / 0.04, 1);
      const targetAlpha =
        phase === "fighting"
          ? shadowSpec.baseAlpha
          : phase === "waiting" || phase === "bite"
            ? shadowSpec.baseAlpha * 0.3
            : 0;
      shadowMat.opacity += (targetAlpha - shadowMat.opacity) * Math.min(1, dt * 4);
      if (shadowMat.opacity > 0.01) {
        const sway = Math.sin(tt * shadowSpec.speed) * shadowSpec.amplitude;
        st.fishShadow.position.set(
          anchor.x + sway,
          Math.max(POND_CENTER.y - POND_RADIUS.ry * 0.5, anchor.y - 0.08),
          -0.55,
        );
      }

      // ── splash update ──
      for (const s of st.splashes) {
        s.age += dt;
        s.vy -= 1.4 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      st.splashes = st.splashes.filter((s) => s.age < s.max);
      for (let i = 0; i < MAX_SPLASH; i++) {
        if (i < st.splashes.length) {
          const s = st.splashes[i];
          st.splashPositions[i * 3] = s.x;
          st.splashPositions[i * 3 + 1] = s.y;
          st.splashPositions[i * 3 + 2] = -0.3;
          const fade = 1 - s.age / s.max;
          st.splashColors[i * 3] = 0.85 + fade * 0.15;
          st.splashColors[i * 3 + 1] = 0.94;
          st.splashColors[i * 3 + 2] = 1;
        } else {
          st.splashPositions[i * 3 + 1] = -10;
        }
      }
      st.splashAttrPos.needsUpdate = true;
      st.splashAttrCol.needsUpdate = true;

      // ── 잡힘 컷씬 ──
      if (phase === "caught" && showCatchRef.current && !st.caughtFishGroup) {
        const grp = makeCaughtFishPlaceholder(rarityRef.current);
        grp.position.set(0.5, 0.3, 0.5);
        grp.scale.setScalar(0);
        st.caughtFishGroup = grp;
        st.caughtFishStartMs = now;
        st.scene.add(grp);
        emitSplash("caught", { x: 0.5, y: 0.28 });

        if (fishGlbUrlRef.current) {
          const loader = new GLTFLoader();
          const url = fishGlbUrlRef.current;
          loader.load(
            url,
            (gltf) => {
              const st2 = stateRef.current;
              if (!st2 || !st2.caughtFishGroup) return;
              const g = gltf.scene;
              const box = new THREE.Box3().setFromObject(g);
              const sizeVec = new THREE.Vector3();
              box.getSize(sizeVec);
              const center = new THREE.Vector3();
              box.getCenter(center);
              g.position.sub(center);
              const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
              g.scale.setScalar(0.2 / Math.max(0.01, maxDim));
              while (st2.caughtFishGroup.children.length > 0) {
                st2.caughtFishGroup.remove(st2.caughtFishGroup.children[0]);
              }
              st2.caughtFishGroup.add(g);
            },
            undefined,
            () => null,
          );
        }
      }
      if (st.caughtFishGroup && phase !== "caught") {
        st.scene.remove(st.caughtFishGroup);
        st.caughtFishGroup = null;
      }
      if (st.caughtFishGroup) {
        const t = Math.min(1, (now - st.caughtFishStartMs) / 1400);
        const yArc = 0.3 + Math.sin(t * Math.PI) * 0.28;
        st.caughtFishGroup.position.set(0.5, yArc, 0.5);
        st.caughtFishGroup.rotation.y = t * Math.PI * 2;
        const s = t < 0.2 ? t * 5 : 1;
        st.caughtFishGroup.scale.setScalar(s);
      }

      st.renderer.render(st.scene, st.camera);
      lastBobberAnchor = { ...anchor };
    };
    animate();

    return () => {
      const st = stateRef.current;
      if (st) {
        cancelAnimationFrame(st.raf);
        st.ripples.forEach((r) => {
          st.scene.remove(r.mesh);
          r.mat.dispose();
          r.mesh.geometry.dispose();
        });
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
  }, []);

  return <div ref={containerRef} className="absolute inset-0" aria-hidden />;
}

function makeCaughtFishPlaceholder(
  rarity: "common" | "rare" | "legendary",
): THREE.Group {
  const grp = new THREE.Group();
  const color =
    rarity === "legendary"
      ? COLOR.fishLegendary
      : rarity === "rare"
        ? COLOR.fishRare
        : COLOR.fishCommon;
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 28, 22),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      roughness: 0.4,
    }),
  );
  body.scale.set(1.5, 0.8, 0.7);
  grp.add(body);
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.04, 0.06, 10),
    new THREE.MeshBasicMaterial({ color }),
  );
  tail.position.x = -0.08;
  tail.rotation.z = Math.PI / 2;
  grp.add(tail);
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.01, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x111111 }),
  );
  eye.position.set(0.05, 0.015, 0.04);
  grp.add(eye);
  const light = new THREE.PointLight(0xffffff, 0.7, 0.8);
  light.position.set(0.2, 0.2, 0.3);
  grp.add(light);
  return grp;
}
