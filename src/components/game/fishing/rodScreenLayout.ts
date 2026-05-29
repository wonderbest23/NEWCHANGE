import * as THREE from "three";
import type { FishingViewportTier } from "./fishingViewport";

export type RodNdcTargets = {
  gripNdc: THREE.Vector2;
  tipNdc: THREE.Vector2;
  /** 카메라 로컬 전방 거리 (z = -gripDepth) */
  gripDepth: number;
  /** 화면 높이 대비 낚싯대 NDC span 목표 (0.38–0.45) */
  screenRodSpan: number;
  anchorScale: number;
};

export type RodScreenRigResult = {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  quaternion: THREE.Quaternion;
  scale: number;
  rodModelLength: number;
  gripNdcExpected: THREE.Vector2;
  tipNdcExpected: THREE.Vector2;
};

/** 모바일: grip 우하단 15–25%, tip 중앙~좌상 */
const MOBILE_NDC: RodNdcTargets = {
  gripNdc: new THREE.Vector2(0.38, -0.72),
  tipNdc: new THREE.Vector2(-0.14, 0.06),
  gripDepth: 0.5,
  screenRodSpan: 0.42,
  anchorScale: 1,
};

/** PC·태블릿 wide: 동일 FPV, grip 약간 안쪽 */
const WIDE_NDC: RodNdcTargets = {
  gripNdc: new THREE.Vector2(0.4, -0.66),
  tipNdc: new THREE.Vector2(-0.1, 0.1),
  gripDepth: 0.55,
  screenRodSpan: 0.4,
  anchorScale: 1,
};

export function rodNdcTargetsForTier(tier: FishingViewportTier): RodNdcTargets {
  return tier === "mobilePortrait" ? MOBILE_NDC : WIDE_NDC;
}

function ndcToCameraLocal(
  ndcX: number,
  ndcY: number,
  depth: number,
  fovDeg: number,
  aspect: number,
): THREE.Vector3 {
  const t = Math.tan((fovDeg * Math.PI) / 180 / 2) * depth;
  return new THREE.Vector3(ndcX * t * aspect, ndcY * t, -depth);
}

/**
 * NDC grip/tip → rodAnchor position·rotation·length (카메라 자식 rig).
 * 모델: 손잡이 원점, 팁 로컬 -Z.
 */
export function buildRodRigFromScreen(
  fovDeg: number,
  aspect: number,
  targets: RodNdcTargets,
): RodScreenRigResult {
  const gripPos = ndcToCameraLocal(
    targets.gripNdc.x,
    targets.gripNdc.y,
    targets.gripDepth,
    fovDeg,
    aspect,
  );

  const tipDepth = targets.gripDepth * 1.12;
  const tipPos = ndcToCameraLocal(targets.tipNdc.x, targets.tipNdc.y, tipDepth, fovDeg, aspect);

  const tipDir = tipPos.clone().sub(gripPos);
  if (tipDir.lengthSq() < 1e-8) tipDir.set(0, 0.2, -1);
  tipDir.normalize();

  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), tipDir);
  const rotation = new THREE.Euler(0, 0, 0, "YXZ");
  rotation.setFromQuaternion(quaternion, "YXZ");

  const reach = gripPos.distanceTo(tipPos);
  const spanFromFrustum =
    2 * Math.tan((fovDeg * Math.PI) / 180 / 2) * targets.gripDepth * targets.screenRodSpan;
  const rodModelLength = Math.max(reach, spanFromFrustum) / targets.anchorScale;

  return {
    position: gripPos,
    rotation,
    quaternion,
    scale: targets.anchorScale,
    rodModelLength,
    gripNdcExpected: targets.gripNdc.clone(),
    tipNdcExpected: targets.tipNdc.clone(),
  };
}

/** 프로시저 낚싯대 blank 길이 (align 전 로컬 -Z) */
export const PROCEDURAL_ROD_LENGTH = 1.21;

/** 배치 후 grip(원점)·팁(local -Z) NDC 측정 */
export function measureRodGripTipNdc(
  camera: THREE.PerspectiveCamera,
  rodAnchor: THREE.Object3D,
  rodModelLength: number,
): { grip: THREE.Vector2; tip: THREE.Vector2; spanY: number } {
  rodAnchor.updateMatrixWorld(true);
  const gripWorld = new THREE.Vector3();
  rodAnchor.getWorldPosition(gripWorld);

  const tipWorld = new THREE.Vector3(0, 0, -rodModelLength);
  tipWorld.applyMatrix4(rodAnchor.matrixWorld);

  const gripNdc = gripWorld.clone().project(camera);
  const tipNdc = tipWorld.clone().project(camera);

  return {
    grip: new THREE.Vector2(gripNdc.x, gripNdc.y),
    tip: new THREE.Vector2(tipNdc.x, tipNdc.y),
    spanY: tipNdc.y - gripNdc.y,
  };
}
