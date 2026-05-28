/**
 * FishingArScene — 카메라 영상 위 AR 낚시터 합성.
 *
 * 구성 (orthographic 풍 perspective):
 *  - 화면 하단 ~40% 가상 연못 (ellipse, 반투명, 가장자리 부드러운 빛)
 *  - 낚싯대 (우측 하단 SVG — 본 컴포넌트는 캔버스, 낚싯대는 부모가 그림)
 *  - 찌 (sphere with red top/white bottom)
 *  - 물고기 그림자 (ellipse, fighting 중)
 *  - 물결 ripple (지속) + splash (착수)
 *  - 잡힘 시 GLB 물고기 또는 emoji 점프
 *
 * lazy import 대상 — 부모(FishingScenario) 가 Suspense 로 감쌈.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { FishingPhase } from "@/lib/game/action-context";

export interface FishingArSceneProps {
  phase: FishingPhase;
  /** 정규화 화면 좌표 (0..1) */
  bobberX: number;
  bobberY: number;
  /** AI 생성 물고기 GLB URL (option) */
  fishGlbUrl?: string | null;
  /** rarity 색 (legendary 면 황금) */
  fishRarity?: "common" | "rare" | "legendary";
  /** 잡힘 직후 cutscene 표시용 */
  showCatch?: boolean;
  /** scene resize 안정성용 */
  size?: { width: number; height: number };
}

const RARITY_BODY: Record<"common" | "rare" | "legendary", number> = {
  common: 0x86d68a,
  rare: 0x60a5fa,
  legendary: 0xfbbf24,
};

interface RippleSpec {
  bornMs: number;
  x: number;
  y: number;
  duration: number;
}

interface SplashParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  max: number;
}

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
    pondMat: THREE.MeshBasicMaterial;
    bobberGroup: THREE.Group;
    fishShadow: THREE.Mesh;
    ripples: RippleSpec[];
    splashes: SplashParticle[];
    rippleMeshes: THREE.Mesh[];
    splashPoints: THREE.Points;
    splashPositions: Float32Array;
    splashColors: Float32Array;
    caughtFishGroup: THREE.Group | null;
    caughtFishStartMs: number;
    raf: number;
    clock: THREE.Clock;
  } | null>(null);

  // mount
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
    // orthographic — 화면 정규화 좌표 (0..1) 그대로 다루기.
    // 좌하단 (0,0), 우상단 (1,1). y 는 위로 +.
    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);

    // ── 연못 (화면 하단 타원) ──
    const pondMat = new THREE.MeshBasicMaterial({
      color: 0x1d4ed8,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const pondGeo = new THREE.CircleGeometry(0.5, 64);
    const pond = new THREE.Mesh(pondGeo, pondMat);
    pond.scale.set(1.05, 0.32, 1); // 화면 폭에 가깝게 넓게, 세로는 좁게
    pond.position.set(0.5, 0.22, -1);
    scene.add(pond);

    // 연못 가장자리 빛 ring
    const pondRingMat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const pondRing = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.5, 64), pondRingMat);
    pondRing.scale.copy(pond.scale);
    pondRing.position.set(0.5, 0.22, -0.99);
    scene.add(pondRing);

    // ── 찌 ──
    const bobberGroup = new THREE.Group();
    const bobBody = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 18, 16),
      new THREE.MeshBasicMaterial({ color: 0xdc2626 }),
    );
    const bobTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    bobTop.position.y = 0.012;
    bobberGroup.add(bobBody);
    bobberGroup.add(bobTop);
    bobberGroup.position.set(0.5, 0.3, 0);
    bobberGroup.visible = false;
    scene.add(bobberGroup);

    // ── 물고기 그림자 (fighting 중) ──
    const fishShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 32),
      new THREE.MeshBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    fishShadow.scale.set(1.8, 0.6, 1);
    fishShadow.position.set(0.5, 0.2, -0.5);
    scene.add(fishShadow);

    // ── splash particles ──
    const splashCount = 80;
    const splashPositions = new Float32Array(splashCount * 3);
    const splashColors = new Float32Array(splashCount * 3);
    for (let i = 0; i < splashCount; i++) splashPositions[i * 3 + 1] = -10;
    const splashGeo = new THREE.BufferGeometry();
    splashGeo.setAttribute("position", new THREE.BufferAttribute(splashPositions, 3));
    splashGeo.setAttribute("color", new THREE.BufferAttribute(splashColors, 3));
    const splashMat = new THREE.PointsMaterial({
      size: 0.012,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const splashPoints = new THREE.Points(splashGeo, splashMat);
    scene.add(splashPoints);

    stateRef.current = {
      renderer,
      scene,
      camera,
      pondMat,
      bobberGroup,
      fishShadow,
      ripples: [],
      splashes: [],
      rippleMeshes: [],
      splashPoints,
      splashPositions,
      splashColors,
      caughtFishGroup: null,
      caughtFishStartMs: 0,
      raf: 0,
      clock: new THREE.Clock(),
    };

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      // orthographic 은 그대로 — 정규화 좌표 유지.
    });
    ro.observe(container);

    function emitSplash(x: number, y: number, count: number) {
      const st = stateRef.current!;
      for (let i = 0; i < count; i++) {
        const angle = Math.PI + Math.random() * Math.PI; // 위 반구
        const speed = 0.05 + Math.random() * 0.12;
        st.splashes.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          age: 0,
          max: 0.4 + Math.random() * 0.4,
        });
      }
    }

    function emitRipple(x: number, y: number) {
      const st = stateRef.current!;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xa5b4fc,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.012, 32), mat);
      ring.scale.set(1.5, 0.6, 1); // 타원
      ring.position.set(x, y, -0.4);
      st.scene.add(ring);
      st.rippleMeshes.push(ring);
      st.ripples.push({ bornMs: performance.now(), x, y, duration: 1800 });
    }

    let lastRippleAt = 0;
    let lastSplashKey = "";

    const animate = () => {
      const st = stateRef.current;
      if (!st) return;
      st.raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.05, st.clock.getDelta());

      const phase = phaseRef.current;
      const bobber = bobberRef.current;

      // 찌 위치 + 가시성
      const showBobber =
        phase === "floating" ||
        phase === "waiting" ||
        phase === "bite" ||
        phase === "fighting";
      st.bobberGroup.visible = showBobber;
      if (showBobber) {
        let bx = bobber.x;
        let by = bobber.y;
        const bob = Math.sin(now / 600) * 0.005;
        by += bob;
        if (phase === "bite") {
          bx += (Math.random() - 0.5) * 0.015;
          by += (Math.random() - 0.5) * 0.015;
        }
        st.bobberGroup.position.set(bx, by, 0);
      }

      // 착수 splash 1회 — phase floating 진입 시점 디텍트 (간단)
      const splashKey = `${phase}:${Math.round(bobber.x * 100)},${Math.round(bobber.y * 100)}`;
      if (phase === "floating" && splashKey !== lastSplashKey) {
        emitSplash(bobber.x, bobber.y, 22);
        emitRipple(bobber.x, bobber.y);
        lastSplashKey = splashKey;
      }

      // 지속 ripple — waiting/bite 동안
      if ((phase === "waiting" || phase === "bite") && showBobber) {
        const interval = phase === "bite" ? 500 : 1500;
        if (now - lastRippleAt > interval) {
          emitRipple(bobber.x, bobber.y);
          lastRippleAt = now;
        }
      }

      // ripple 업데이트
      for (let i = st.ripples.length - 1; i >= 0; i--) {
        const r = st.ripples[i];
        const age = (now - r.bornMs) / r.duration;
        if (age >= 1) {
          st.scene.remove(st.rippleMeshes[i]);
          (st.rippleMeshes[i].material as THREE.MeshBasicMaterial).dispose();
          st.rippleMeshes[i].geometry.dispose();
          st.ripples.splice(i, 1);
          st.rippleMeshes.splice(i, 1);
          continue;
        }
        const mesh = st.rippleMeshes[i];
        const s = 1 + age * 8;
        mesh.scale.set(1.5 * s, 0.6 * s, 1);
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - age);
      }

      // splash 업데이트
      let writeIdx = 0;
      for (const s of st.splashes) {
        s.age += dt;
        s.vy -= 1.5 * dt; // 중력
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      st.splashes = st.splashes.filter((s) => s.age < s.max);
      for (let i = 0; i < st.splashPositions.length / 3; i++) {
        if (i < st.splashes.length) {
          const s = st.splashes[i];
          st.splashPositions[i * 3] = s.x;
          st.splashPositions[i * 3 + 1] = s.y;
          st.splashPositions[i * 3 + 2] = -0.3;
          const fade = 1 - s.age / s.max;
          st.splashColors[i * 3] = 0.7 + fade * 0.3;
          st.splashColors[i * 3 + 1] = 0.85;
          st.splashColors[i * 3 + 2] = 1;
        } else {
          st.splashPositions[i * 3 + 1] = -10;
        }
      }
      const posAttr = st.splashPoints.geometry.attributes.position as THREE.BufferAttribute;
      const colAttr = st.splashPoints.geometry.attributes.color as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      writeIdx;

      // 물고기 그림자 (fighting)
      if (phase === "fighting") {
        const mat = st.fishShadow.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.min(0.55, mat.opacity + dt * 0.4);
        const sway = Math.sin(now / 300) * 0.08;
        st.fishShadow.position.set(bobber.x + sway, Math.max(0.12, bobber.y - 0.08), -0.5);
      } else {
        const mat = st.fishShadow.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, mat.opacity - dt * 0.8);
      }

      // 잡힘 컷씬 — 물고기 점프
      if (phase === "caught" && showCatchRef.current && !st.caughtFishGroup) {
        const grp = makeCaughtFishPlaceholder(rarityRef.current);
        grp.position.set(0.5, 0.3, 0.5);
        grp.scale.setScalar(0);
        st.caughtFishGroup = grp;
        st.caughtFishStartMs = now;
        st.scene.add(grp);
        emitSplash(0.5, 0.3, 50);
        // 추후 GLB 모델 로드 + 교체
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
              g.scale.setScalar(0.18 / Math.max(0.01, maxDim));
              // placeholder 자식 제거 후 GLB 추가
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
        // jump arc + rotate
        const yArc = 0.3 + Math.sin(t * Math.PI) * 0.25;
        st.caughtFishGroup.position.set(0.5, yArc, 0.5);
        st.caughtFishGroup.rotation.y = t * Math.PI * 2;
        const s = t < 0.2 ? t * 5 : 1;
        st.caughtFishGroup.scale.setScalar(s);
      }

      st.renderer.render(st.scene, st.camera);
    };
    animate();

    return () => {
      const st = stateRef.current;
      if (st) {
        cancelAnimationFrame(st.raf);
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
  }, []);

  return <div ref={containerRef} className="absolute inset-0" aria-hidden />;
}

function makeCaughtFishPlaceholder(rarity: "common" | "rare" | "legendary"): THREE.Group {
  const grp = new THREE.Group();
  const color = RARITY_BODY[rarity];
  // 간단 물고기 — sphere 몸통 + cone 꼬리
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 24, 18),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.3,
      roughness: 0.4,
    }),
  );
  body.scale.set(1.4, 0.8, 0.7);
  grp.add(body);
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.04, 0.06, 8),
    new THREE.MeshBasicMaterial({ color }),
  );
  tail.position.x = -0.08;
  tail.rotation.z = Math.PI / 2;
  grp.add(tail);
  // 약한 빛
  const light = new THREE.PointLight(0xffffff, 0.6, 0.6);
  light.position.set(0.2, 0.2, 0.3);
  grp.add(light);
  return grp;
}
