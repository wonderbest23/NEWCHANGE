import * as THREE from "three";
import { isRodModelRenderable } from "./alignRodModelToCameraRig";
import { isFishingDebugEnabled } from "./fishingRodPolicy";

export type RodActivationResult = {
  ok: boolean;
  reason: string;
  meshCount: number;
  ndc?: {
    spanX: number;
    spanY: number;
    spanZ: number;
    onScreen: boolean;
  };
};

/** GLB 메쉬가 모바일 WebGL에서도 보이도록 */
export function prepareRodGlbMeshes(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.frustumCulled = false;
    child.visible = true;
    child.renderOrder = 12;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of materials) {
      if (!mat) continue;
      mat.side = THREE.DoubleSide;
      mat.depthWrite = true;
      mat.transparent = false;
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.roughness = Math.min(0.9, mat.roughness ?? 0.7);
        mat.metalness = Math.min(0.35, mat.metalness ?? 0.1);
      }
    }
  });
}

function countMeshes(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((c) => {
    if (c instanceof THREE.Mesh) n += 1;
  });
  return n;
}

/** -Z 방향 rod는 XY span이 작을 수 있음 — mesh+bbox만 검사 */
export function evaluateRodGlbActivation(
  camera: THREE.PerspectiveCamera,
  rodRoot: THREE.Object3D,
): RodActivationResult {
  const meshCount = countMeshes(rodRoot);
  if (meshCount === 0) {
    return { ok: false, reason: "no_meshes", meshCount };
  }
  if (!isRodModelRenderable(rodRoot)) {
    return { ok: false, reason: "invalid_bbox", meshCount };
  }

  const box = new THREE.Box3().setFromObject(rodRoot);
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];
  let minX = 1;
  let maxX = -1;
  let minY = 1;
  let maxY = -1;
  let minZ = 1;
  let maxZ = -1;
  for (const c of corners) {
    c.applyMatrix4(rodRoot.matrixWorld);
    c.project(camera);
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
    minZ = Math.min(minZ, c.z);
    maxZ = Math.max(maxZ, c.z);
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;
  const inFrustum = maxZ > -1 && minZ < 1;
  const onScreen =
    inFrustum && maxX >= -1.2 && minX <= 1.2 && maxY >= -1.2 && minY <= 1.2;

  const ndc = { spanX, spanY, spanZ, onScreen };

  if (!inFrustum) {
    return { ok: false, reason: "outside_frustum", meshCount, ndc };
  }

  return { ok: true, reason: "ok", meshCount, ndc };
}

export function logRodGlbActivationFailure(
  reason: string,
  extra?: Record<string, unknown>,
) {
  if (!isFishingDebugEnabled() && !import.meta.env.DEV) return;
  console.warn("[fishing] GLB rod fallback to procedural:", reason, extra ?? "");
}
