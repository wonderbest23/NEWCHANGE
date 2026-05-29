import * as THREE from "three";

const TIP_ANCHOR_NAME = "rodTipAnchor";
const ROD_TIP_LOCAL = new THREE.Vector3(0, 0, -1);

type Axis = "x" | "y" | "z";

function longestAxis(size: THREE.Vector3): Axis {
  if (size.x >= size.y && size.x >= size.z) return "x";
  if (size.y >= size.z) return "y";
  return "z";
}

function axisVector(axis: Axis, sign: 1 | -1): THREE.Vector3 {
  if (axis === "x") return new THREE.Vector3(sign, 0, 0);
  if (axis === "y") return new THREE.Vector3(0, sign, 0);
  return new THREE.Vector3(0, 0, sign);
}

/** 긴 축 양 끝 중 단면적(볼륨 proxy)이 큰 쪽 = 손잡이 */
function gripEndIsMinOnAxis(object: THREE.Object3D, axis: Axis): boolean {
  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const axisKey = axis as "x" | "y" | "z";

  let lowVol = 0;
  let highVol = 0;
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const meshBox = new THREE.Box3().setFromObject(child);
    const meshCenter = new THREE.Vector3();
    meshBox.getCenter(meshCenter);
    const meshSize = new THREE.Vector3();
    meshBox.getSize(meshSize);
    const vol = Math.max(1e-8, meshSize.x * meshSize.y * meshSize.z);
    if (meshCenter[axisKey] < center[axisKey]) lowVol += vol;
    else highVol += vol;
  });

  if (lowVol > 0 || highVol > 0) return lowVol >= highVol;

  const size = new THREE.Vector3();
  box.getSize(size);
  return true;
}

export type AlignRodOptions = {
  /** 카메라 rig 로컬에서 -Z 방향 목표 길이 (손잡이~팁) */
  targetLength?: number;
};

/**
 * GLB 낚싯대: bbox 긴 축 자동 검출 → 손잡이=원점(z≈0), 팁=-Z.
 * π 플립 추측 없음.
 */
export function alignRodModelToCameraRig(
  rodObject: THREE.Object3D,
  options: AlignRodOptions = {},
): THREE.Object3D {
  rodObject.position.set(0, 0, 0);
  rodObject.rotation.set(0, 0, 0);
  rodObject.scale.set(1, 1, 1);
  rodObject.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(rodObject);
  if (box.isEmpty()) return ensureRodTipAnchor(rodObject);

  const size = new THREE.Vector3();
  box.getSize(size);
  const axis = longestAxis(size);
  const gripAtMin = gripEndIsMinOnAxis(rodObject, axis);

  const tipSign: 1 | -1 = gripAtMin ? -1 : 1;
  const tipDirModel = axisVector(axis, tipSign);

  const alignQuat = new THREE.Quaternion().setFromUnitVectors(
    tipDirModel.normalize(),
    ROD_TIP_LOCAL.clone(),
  );
  rodObject.quaternion.copy(alignQuat);
  rodObject.updateMatrixWorld(true);

  const fitted = new THREE.Box3().setFromObject(rodObject);
  const length = Math.max(0.05, fitted.max.z - fitted.min.z);

  if (options.targetLength && options.targetLength > 0) {
    rodObject.scale.setScalar(options.targetLength / length);
    rodObject.updateMatrixWorld(true);
  }

  const scaled = new THREE.Box3().setFromObject(rodObject);
  rodObject.position.set(0, 0, -scaled.max.z);

  rodObject.traverse((obj) => {
    obj.frustumCulled = false;
    obj.visible = true;
  });

  return ensureRodTipAnchor(rodObject);
}

export function ensureRodTipAnchor(rodRoot: THREE.Object3D): THREE.Object3D {
  const existing = rodRoot.getObjectByName(TIP_ANCHOR_NAME);
  if (existing) return existing;

  const tipAnchor = new THREE.Object3D();
  tipAnchor.name = TIP_ANCHOR_NAME;
  const box = new THREE.Box3().setFromObject(rodRoot);
  tipAnchor.position.set(0, 0, box.min.z);
  rodRoot.add(tipAnchor);
  return tipAnchor;
}

export function isRodModelRenderable(rodObject: THREE.Object3D): boolean {
  const box = new THREE.Box3().setFromObject(rodObject);
  if (box.isEmpty()) return false;
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  return maxDim > 0.02 && maxDim < 80;
}
