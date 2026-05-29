import * as THREE from "three";
import { measureRodGripTipNdc } from "./rodScreenLayout";

/** VITE_DEBUG_FISHING=1 — 낚싯대 화면 NDC bbox 로그 */
export function logRodScreenBBox(
  camera: THREE.PerspectiveCamera,
  rodRoot: THREE.Object3D,
  label: string,
) {
  const box = new THREE.Box3().setFromObject(rodRoot);
  if (box.isEmpty()) {
    console.info(`[fishing rod] ${label}`, { empty: true });
    return;
  }

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

  for (const corner of corners) {
    corner.applyMatrix4(rodRoot.matrixWorld);
    corner.project(camera);
    minX = Math.min(minX, corner.x);
    maxX = Math.max(maxX, corner.x);
    minY = Math.min(minY, corner.y);
    maxY = Math.max(maxY, corner.y);
    minZ = Math.min(minZ, corner.z);
    maxZ = Math.max(maxZ, corner.z);
  }

  const onScreen = maxX >= -1 && minX <= 1 && maxY >= -1 && minY <= 1 && maxZ >= -1 && minZ <= 1;
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  console.info(`[fishing rod] ${label}`, {
    ndc: { minX, maxX, minY, maxY, minZ, maxZ },
    onScreen,
    worldVisible: rodRoot.visible,
    scale: rodRoot.scale.toArray().map((v) => +v.toFixed(3)),
  });

  return onScreen && spanX > 0.06 && spanY > 0.06;
}

export function logRodGripTipNdc(
  camera: THREE.PerspectiveCamera,
  rodAnchor: THREE.Object3D,
  rodModelLength: number,
  label: string,
  expected?: { grip: THREE.Vector2; tip: THREE.Vector2 },
) {
  const m = measureRodGripTipNdc(camera, rodAnchor, rodModelLength);
  console.info(`[fishing rod] ${label} grip/tip NDC`, {
    grip: { x: +m.grip.x.toFixed(3), y: +m.grip.y.toFixed(3) },
    tip: { x: +m.tip.x.toFixed(3), y: +m.tip.y.toFixed(3) },
    spanY: +m.spanY.toFixed(3),
    expected: expected
      ? {
          grip: { x: expected.grip.x, y: expected.grip.y },
          tip: { x: expected.tip.x, y: expected.tip.y },
        }
      : undefined,
    onScreen:
      m.grip.x >= -1.1 &&
      m.grip.x <= 1.1 &&
      m.grip.y >= -1.1 &&
      m.grip.y <= 1.1 &&
      m.tip.x >= -1.1 &&
      m.tip.x <= 1.1 &&
      m.tip.y >= -1.1 &&
      m.tip.y <= 1.1,
  });
  return m;
}

/** GLB 활성화 전 화면에 실제로 그려지는지 */
export function isRodVisibleOnScreen(
  camera: THREE.PerspectiveCamera,
  rodRoot: THREE.Object3D,
  minSpan = 0.06,
): boolean {
  const box = new THREE.Box3().setFromObject(rodRoot);
  if (box.isEmpty()) return false;

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

  for (const corner of corners) {
    corner.applyMatrix4(rodRoot.matrixWorld);
    corner.project(camera);
    minX = Math.min(minX, corner.x);
    maxX = Math.max(maxX, corner.x);
    minY = Math.min(minY, corner.y);
    maxY = Math.max(maxY, corner.y);
    minZ = Math.min(minZ, corner.z);
    maxZ = Math.max(maxZ, corner.z);
  }

  const onScreen = maxX >= -1 && minX <= 1 && maxY >= -1 && minY <= 1 && maxZ >= -1 && minZ <= 1;
  return onScreen && maxX - minX > minSpan && maxY - minY > minSpan;
}
