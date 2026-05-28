/**
 * Three.js 기반 AR 씬 — 카메라 비디오 위에 3D 몬스터를 렌더링.
 *
 * - 실제 WebXR immersive-ar 세션은 iOS Safari 미지원으로 제외하고,
 *   "비디오 배경 + 디바이스 기울기 → 카메라 회전" 의 lightweight AR 을 구현한다.
 * - 몬스터는 등급별로 다른 기본 도형/색상 (저폴리곤) + 회전·바운스 애니메이션.
 * - 사용자 탭이 몬스터 메시에 명중했는지 Raycaster 로 판정.
 *   조준 정확도가 포획 mechanic 에 의미를 부여한다 (PDF "슈팅" 모드 대응).
 *
 * SSR/번들 부담을 줄이려고 부모(MonsterCatchCamera) 에서 lazy import.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { MonsterRarity } from "@/lib/game/monsters";

type Orientation = { x: number; y: number };

interface Props {
  monsterKey: string;
  rarity: MonsterRarity;
  /** 현재까지 명중 횟수 (외부 상태) */
  hits: number;
  /** 명중 필요 횟수 */
  hitsRequired: number;
  /** 디바이스 기울기 — MonsterCatchCamera 에서 가져옴 (px offset, but 우리는 각도로 환산) */
  orientation: Orientation;
  /** 화면 좌표(0..1)에 대해 명중 여부 판정해 콜백. true 면 외부 hits++ 실행 */
  onAim: (hit: boolean, screenX: number, screenY: number) => void;
  /** 라벨로 표시할 몬스터 이름 (옵션) */
  monsterName?: string;
}

const RARITY_COLOR: Record<MonsterRarity, number> = {
  common: 0x86d68a,
  rare: 0x60a5fa,
  legendary: 0xfbbf24,
};

const RARITY_EMISSIVE: Record<MonsterRarity, number> = {
  common: 0x223322,
  rare: 0x14283f,
  legendary: 0x4a3408,
};

function makeMonsterMesh(rarity: MonsterRarity): THREE.Group {
  const group = new THREE.Group();

  const color = RARITY_COLOR[rarity];
  const emissive = RARITY_EMISSIVE[rarity];

  // 몸통 — rarity 별로 다른 도형
  let bodyGeom: THREE.BufferGeometry;
  if (rarity === "legendary") {
    bodyGeom = new THREE.IcosahedronGeometry(0.6, 0);
  } else if (rarity === "rare") {
    bodyGeom = new THREE.OctahedronGeometry(0.55, 0);
  } else {
    bodyGeom = new THREE.SphereGeometry(0.5, 24, 18);
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

  // 눈 두 개 — 어두운 작은 구
  const eyeGeom = new THREE.SphereGeometry(0.08, 12, 12);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeL = new THREE.Mesh(eyeGeom, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeom, eyeMat);
  eyeL.position.set(-0.18, 0.12, 0.45);
  eyeR.position.set(0.18, 0.12, 0.45);
  group.add(eyeL);
  group.add(eyeR);

  // legendary 는 추가로 후광 링
  if (rarity === "legendary") {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.04, 12, 48),
      new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.65 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.7;
    ring.name = "halo";
    group.add(ring);
  }

  group.userData.bodyMat = bodyMat;
  return group;
}

export function MonsterArScene({
  monsterKey: _monsterKey,
  rarity,
  hits,
  hitsRequired,
  orientation,
  onAim,
  monsterName,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    monster: THREE.Group;
    raycaster: THREE.Raycaster;
    rafId: number;
    targetRotY: number;
    targetRotX: number;
    spawnTime: number;
    flashUntil: number;
  } | null>(null);
  const orientationRef = useRef(orientation);
  orientationRef.current = orientation;
  const hitsRef = useRef(hits);
  hitsRef.current = hits;
  const requiredRef = useRef(hitsRequired);
  requiredRef.current = hitsRequired;

  // mount once — Three.js 씬 생성/해제
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

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 50);
    camera.position.set(0, 0, 3);

    // 조명 — 정면 light + ambient
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(2, 3, 4);
    scene.add(dir);
    const rim = new THREE.DirectionalLight(0xc7d2fe, 0.35);
    rim.position.set(-3, -2, -2);
    scene.add(rim);

    const monster = makeMonsterMesh(rarity);
    monster.position.set(0, 0, 0);
    scene.add(monster);

    const raycaster = new THREE.Raycaster();

    stateRef.current = {
      renderer,
      scene,
      camera,
      monster,
      raycaster,
      rafId: 0,
      targetRotY: 0,
      targetRotX: 0,
      spawnTime: performance.now(),
      flashUntil: 0,
    };

    // Resize observer 로 부모 컨테이너 변동 대응
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    const animate = () => {
      const st = stateRef.current;
      if (!st) return;
      st.rafId = requestAnimationFrame(animate);

      const t = (performance.now() - st.spawnTime) / 1000;

      // device tilt → 카메라 회전 (작은 각도). orientation.x/y 는 px 오프셋 단위라
      // 분모로 나눠 라디안화. 너무 빠르면 가중 평균으로 보간.
      const targetY = -orientationRef.current.x / 200;
      const targetX = orientationRef.current.y / 250;
      st.targetRotY += (targetY - st.targetRotY) * 0.15;
      st.targetRotX += (targetX - st.targetRotX) * 0.15;
      st.camera.rotation.y = st.targetRotY;
      st.camera.rotation.x = st.targetRotX;

      // 몬스터 idle 애니메이션 (회전·바운스).
      st.monster.rotation.y = t * 0.6;
      st.monster.position.y = Math.sin(t * 2) * 0.08;

      // legendary halo 회전
      const halo = st.monster.getObjectByName("halo");
      if (halo) halo.rotation.z = t * 1.2;

      // hit feedback — flashUntil 시점까지 emissive 강조
      const bodyMat = st.monster.userData.bodyMat as THREE.MeshStandardMaterial | undefined;
      if (bodyMat) {
        const now = performance.now();
        if (now < st.flashUntil) {
          bodyMat.emissiveIntensity = 1.2;
        } else {
          bodyMat.emissiveIntensity = 0.45;
        }
      }

      // 잡힐수록 작아지는 시각 피드백 (남은 hits 가 적어질수록 작아짐)
      const progress = hitsRef.current / Math.max(1, requiredRef.current);
      const scale = 1 - progress * 0.25;
      st.monster.scale.setScalar(Math.max(0.5, scale));

      st.renderer.render(st.scene, st.camera);
    };
    animate();

    return () => {
      const st = stateRef.current;
      if (st) {
        cancelAnimationFrame(st.rafId);
        st.renderer.dispose();
      }
      ro.disconnect();
      try {
        container.removeChild(renderer.domElement);
      } catch {
        /* already detached */
      }
      stateRef.current = null;
    };
  }, [rarity]);

  // 외부에서 hit 발생 시 임팩트 플래시
  useEffect(() => {
    const st = stateRef.current;
    if (!st || hits === 0) return;
    st.flashUntil = performance.now() + 180;
  }, [hits]);

  // 화면 탭을 받아 raycaster 로 명중 판정.
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = stateRef.current;
    const container = containerRef.current;
    if (!st || !container) return;
    const rect = container.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    st.raycaster.setFromCamera(new THREE.Vector2(nx, ny), st.camera);
    const intersects = st.raycaster.intersectObject(st.monster, true);
    onAim(intersects.length > 0, e.clientX, e.clientY);
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
