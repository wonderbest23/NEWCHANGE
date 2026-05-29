import * as THREE from "three";
import { fishingViewportLayout, type RodRigLayout } from "./fishingViewport";

export type { RodRigLayout };
export {
  alignRodModelToCameraRig,
  alignRodModelToCameraRig as alignRodModelToGrip,
  ensureRodTipAnchor,
  isRodModelRenderable,
} from "./alignRodModelToCameraRig";

export const ROD_TIP_LOCAL = new THREE.Vector3(0, 0, -1);
export { PROCEDURAL_ROD_LENGTH } from "./rodScreenLayout";

/** 카메라 자식 rig: 우하단 grip, 팁은 -Z·좌상(연못). */
export function rodRigLayoutForViewport(width: number, height: number): RodRigLayout {
  return fishingViewportLayout(width, height).rod;
}

/** GLB 없을 때 폴백 — 원점=손잡이, blank·tip은 -Z. */
export function createProceduralFishingRod() {
  const group = new THREE.Group();

  const handleMat = new THREE.MeshBasicMaterial({ color: "#5c3d1e" });
  const blankMat = new THREE.MeshBasicMaterial({ color: "#a16207" });
  const reelMat = new THREE.MeshBasicMaterial({ color: "#374151" });

  const alongRod = -Math.PI / 2;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.14, 12), handleMat);
  handle.rotation.x = alongRod;
  handle.position.z = -0.07;
  group.add(handle);

  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 14), reelMat);
  reel.position.set(0.02, -0.048, -0.11);
  group.add(reel);

  const blankLen = 1.05;
  const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.005, blankLen, 8), blankMat);
  blank.rotation.x = alongRod;
  blank.position.z = -(0.14 + blankLen / 2);
  group.add(blank);

  const tipZ = -(0.14 + blankLen + 0.02);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), blankMat);
  tip.position.z = tipZ;
  group.add(tip);

  const tipAnchor = new THREE.Object3D();
  tipAnchor.name = "rodTipAnchor";
  tipAnchor.position.set(0, 0, tipZ);
  group.add(tipAnchor);

  group.visible = true;
  group.traverse((obj) => {
    obj.frustumCulled = false;
    obj.visible = true;
    if ("material" in obj) {
      const mesh = obj as THREE.Mesh;
      mesh.renderOrder = 12;
    }
  });

  return {
    group,
    tipAnchor,
    dispose: () => {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
    },
  };
}

/** @deprecated 카메라 rig 사용 — rodRigLayoutForViewport */
export function rodLayoutForViewport(width: number, height: number) {
  const rig = rodRigLayoutForViewport(width, height);
  return {
    anchorPosition: rig.position,
    anchorRotation: rig.rotation,
    anchorScale: rig.scale,
    baseRotZ: rig.rotation.z,
  };
}
