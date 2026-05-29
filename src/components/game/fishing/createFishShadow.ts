import * as THREE from "three";
import type { PondPhase } from "./createFishingPond";
import type { FishingViewportLayout } from "./fishingViewport";

const DEFAULT_SHADOW_VIEWPORT: FishingViewportLayout["fishShadow"] = {
  xAmp: 0.48,
  fightingAmp: 0.75,
  positionZ: -3.28,
};

function createBlobShadowTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(2, 6, 23, 0.58)");
  gradient.addColorStop(0.42, "rgba(2, 6, 23, 0.22)");
  gradient.addColorStop(1, "rgba(2, 6, 23, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** 수평(바닥) 소프트 타원 그림자 — 회전 없음, Y축 스케일만. */
export function createBlobShadowMesh(initialOpacity = 0.34) {
  const texture = createBlobShadowTexture();
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: initialOpacity,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;

  return {
    mesh,
    material,
    texture,
    setOpacity: (opacity: number) => {
      material.opacity = opacity;
    },
    setScale: (radiusX: number, radiusZ: number) => {
      mesh.scale.set(radiusX, 1, radiusZ);
    },
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

export function createFishShadow() {
  const blob = createBlobShadowMesh(0.32);
  const { mesh, material } = blob;
  mesh.position.set(-0.4, -0.64, -3.28);

  let viewport = DEFAULT_SHADOW_VIEWPORT;
  let floorY = -0.62;

  return {
    mesh,
    setViewportLayout: (layout: FishingViewportLayout["fishShadow"]) => {
      viewport = layout;
      mesh.position.z = layout.positionZ;
    },
    setFloorY: (y: number) => {
      floorY = y;
      mesh.position.y = y + 0.02;
    },
    update: (time: number, phase: PondPhase, hideForCaughtFish = false) => {
      if (hideForCaughtFish || phase === "caught") {
        const nextOpacity = Math.max(0, material.opacity - 0.08);
        blob.setOpacity(nextOpacity);
        return;
      }

      const speed = phase === "bite" || phase === "fighting" ? 4.8 : 2.0;
      const amp = phase === "bite" || phase === "fighting" ? viewport.fightingAmp : viewport.xAmp;
      mesh.position.x = Math.sin(time * speed) * amp;
      mesh.position.y = floorY + 0.02;

      const fighting = phase === "fighting";
      const biting = phase === "bite";
      const radius = fighting ? 0.52 : biting ? 0.46 : 0.38;
      blob.setScale(radius, radius * 0.42);

      blob.setOpacity(
        fighting ? 0.42 : biting ? 0.38 : phase === "escaped" ? 0.12 : 0.3,
      );
    },
    dispose: () => {
      blob.dispose();
    },
  };
}
