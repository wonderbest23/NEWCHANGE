import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createBlobShadowMesh } from "./createFishShadow";
import {
  poseForFishState,
  type CaughtFishState,
  type FishAnimationPreset,
} from "./fishAnimationPresets";
import type { FishingViewportLayout } from "./fishingViewport";

type CaughtActorConfig = {
  defaultScale?: number;
  preset: FishAnimationPreset;
  floorY: number;
};

export function createCaughtFishActor(config: CaughtActorConfig) {
  const loader = new GLTFLoader();
  const group = new THREE.Group();
  group.position.set(0, config.floorY, -2.45);
  group.visible = false;

  let preset: FishAnimationPreset = config.preset;
  let state: CaughtFishState = "hidden";
  let stateElapsed = 0;
  let totalElapsed = 0;
  let model: THREE.Object3D | null = null;
  let modelScale = config.defaultScale ?? 0.9;
  let lastUrl: string | null = null;
  let loadStatus: "idle" | "loaded" | "failed" = "idle";
  let viewportClamp: FishingViewportLayout["caughtFish"] = {
    z: -2.45,
    scaleMultiplier: 1,
    poseScale: 1,
    maxPoseX: 0.28,
  };

  const fallback = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.14, 0.46, 5, 12),
    new THREE.MeshStandardMaterial({
      color: "#93c5fd",
      roughness: 0.45,
      metalness: 0.1,
    }),
  );
  fallback.rotation.x = -Math.PI / 2;
  group.add(fallback);

  const shadow = createBlobShadowMesh(0.3);
  shadow.mesh.position.set(0, 0.02, 0);
  group.add(shadow.mesh);

  const particleCount = 30;
  const positions = new Float32Array(particleCount * 3);
  const geom = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  geom.setAttribute("position", posAttr);
  const mat = new THREE.PointsMaterial({
    color: "#bfdbfe",
    size: 0.045,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geom, mat);
  points.position.set(0, config.floorY, 0);
  group.add(points);

  const particles = Array.from({ length: particleCount }, () => ({
    x: 0,
    y: -999,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
    ttl: 1,
  }));

  function spawnBurst(count: number) {
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const a = Math.random() * Math.PI * 2;
      const s = 0.35 + Math.random() * 0.6;
      p.x = Math.cos(a) * 0.12;
      p.y = 0.06 + Math.random() * 0.06;
      p.z = Math.sin(a) * 0.06;
      p.vx = Math.cos(a) * s * 0.45;
      p.vy = 0.5 + Math.random() * 0.8;
      p.vz = Math.sin(a) * s * 0.18;
      p.life = 0;
      p.ttl = 0.42 + Math.random() * 0.48;
    }
  }

  function applyParticles(dt: number) {
    let alive = false;
    for (let i = 0; i < particleCount; i++) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.ttl) {
        p.y = -999;
      } else {
        alive = true;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 1.3 * dt;
      }
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    posAttr.needsUpdate = true;
    mat.opacity = alive ? 0.85 : 0;
  }

  function disposeModel() {
    if (!model) return;
    group.remove(model);
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
    model = null;
  }

  function loadModel(url: string | null | undefined) {
    if (!url || url === lastUrl) return;
    lastUrl = url;
    loadStatus = "idle";
    loader.load(
      url,
      (gltf) => {
        disposeModel();
        model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z, 0.01);
        const fit = modelScale / maxDim;
        model.scale.setScalar(fit);
        model.rotation.set(-Math.PI / 2, 0, 0);
        group.add(model);
        fallback.visible = false;
        loadStatus = "loaded";
      },
      undefined,
      () => {
        fallback.visible = true;
        loadStatus = "failed";
      },
    );
  }

  function setState(next: CaughtFishState) {
    if (state === next) return;
    state = next;
    stateElapsed = 0;
    group.visible = next !== "hidden";
    if (next === "breach" || next === "captured") spawnBurst(18);
    if (next === "land") spawnBurst(10);
  }

  return {
    group,
    points,
    getState: () => state,
    getLoadStatus: () => loadStatus,
    getModelUrl: () => lastUrl,
    setPreset: (next: FishAnimationPreset) => {
      preset = next;
    },
    setScale: (next: number) => {
      modelScale = next;
    },
    setFloorY: (next: number) => {
      group.position.y = next;
      points.position.y = next;
    },
    setViewportLayout: (layout: FishingViewportLayout["caughtFish"]) => {
      viewportClamp = layout;
      group.position.z = layout.z;
    },
    loadModel,
    setState,
    update: (dt: number) => {
      totalElapsed += dt;
      stateElapsed += dt;
      applyParticles(dt);
      const floorY = group.position.y;
      const rawPose = poseForFishState(preset, state, stateElapsed, floorY);
      const heightAboveFloor = rawPose.y - floorY;
      const pose = {
        ...rawPose,
        x: Math.max(-viewportClamp.maxPoseX, Math.min(viewportClamp.maxPoseX, rawPose.x)),
        y: floorY + heightAboveFloor * viewportClamp.poseScale,
        scale: rawPose.scale * viewportClamp.scaleMultiplier,
      };
      const target = model ?? fallback;
      target.position.set(pose.x, pose.y - floorY, 0);
      target.rotation.set(pose.rotationX, pose.rotationY, pose.rotationZ);
      target.scale.setScalar(pose.scale);

      const fishHeight = Math.max(0, pose.y - floorY);
      const near = Math.max(0, 1 - fishHeight / 0.9);
      const shadowRadius = 0.34 + near * 0.38;
      shadow.setScale(shadowRadius, shadowRadius * 0.44);
      shadow.setOpacity(0.1 + near * 0.3);
    },
    dispose: () => {
      disposeModel();
      fallback.geometry.dispose();
      (fallback.material as THREE.Material).dispose();
      shadow.dispose();
      geom.dispose();
      mat.dispose();
    },
  };
}
