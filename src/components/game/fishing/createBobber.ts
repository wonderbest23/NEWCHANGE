import * as THREE from "three";
import type { PondPhase } from "./createFishingPond";
import type { FishingViewportLayout } from "./fishingViewport";

const DEFAULT_BOBBER_VIEWPORT: FishingViewportLayout["bobber"] = {
  xRange: 1.6,
  yRange: 0.35,
  fightingXAmp: 0.45,
  positionZ: -3.05,
};

/** 팁 앵커 자식 — 라인·찌는 팁에서 연못 방향으로 늘어짐, 찌는 +Y(수직) 유지 */
export function createBobber() {
  const rig = new THREE.Group();
  rig.renderOrder = 11;

  const float = new THREE.Group();
  const topGeom = new THREE.SphereGeometry(0.055, 20, 14);
  const botGeom = new THREE.SphereGeometry(0.05, 20, 14);
  const topMat = new THREE.MeshStandardMaterial({
    color: "#ef4444",
    roughness: 0.55,
    metalness: 0.05,
  });
  const botMat = new THREE.MeshStandardMaterial({
    color: "#f8fafc",
    roughness: 0.45,
    metalness: 0.02,
  });

  const top = new THREE.Mesh(topGeom, topMat);
  const bottom = new THREE.Mesh(botGeom, botMat);
  top.position.y = 0.038;
  bottom.position.y = -0.038;
  float.add(top, bottom);

  const lineMaterial = new THREE.LineBasicMaterial({
    color: "#e2e8f0",
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const lineGeometry = new THREE.BufferGeometry();
  const line = new THREE.Line(lineGeometry, lineMaterial);

  rig.add(line);
  rig.add(float);

  let tipAnchor: THREE.Object3D | null = null;
  let viewport = DEFAULT_BOBBER_VIEWPORT;
  let pondSurfaceY = -1.08;

  const tipWorld = new THREE.Vector3();
  const targetWorld = new THREE.Vector3();
  const localEnd = new THREE.Vector3();
  const linePoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3()];

  const updateLine = (end: THREE.Vector3) => {
    linePoints[1].copy(end);
    lineGeometry.setFromPoints(linePoints);
  };

  const orientFloatUpright = () => {
    if (!tipAnchor) return;
    const parentQuat = new THREE.Quaternion();
    tipAnchor.getWorldQuaternion(parentQuat);
    float.quaternion.copy(parentQuat).invert();
  };

  return {
    rig,
    attachToRodTip: (tip: THREE.Object3D | null) => {
      if (tipAnchor) tipAnchor.remove(rig);
      tipAnchor = tip;
      if (tip) {
        tip.add(rig);
        rig.position.set(0, 0, 0);
      }
    },
    setPondSurfaceY: (y: number) => {
      pondSurfaceY = y;
    },
    setViewportLayout: (layout: FishingViewportLayout["bobber"]) => {
      viewport = layout;
    },
    update: (time: number, phase: PondPhase, xNorm: number, yNorm: number) => {
      if (!tipAnchor) {
        rig.visible = false;
        return;
      }

      const show =
        phase === "waiting" ||
        phase === "floating" ||
        phase === "bite" ||
        phase === "fighting";
      rig.visible = show;
      if (!show) return;

      let targetX = (xNorm - 0.5) * viewport.xRange;
      let targetY = pondSurfaceY + (0.5 - yNorm) * viewport.yRange;
      const targetZ = viewport.positionZ;

      if (phase === "bite") {
        targetX += Math.sin(time * 12) * 0.04;
        targetY += Math.sin(time * 16) * 0.09 - 0.08;
        float.rotation.z = Math.sin(time * 18) * 0.22;
      } else if (phase === "fighting") {
        targetX += Math.sin(time * 5.5) * viewport.fightingXAmp;
        targetY += Math.sin(time * 8) * 0.06;
        float.rotation.z = Math.sin(time * 10) * 0.28;
      } else if (phase === "waiting" || phase === "floating") {
        targetY += Math.sin(time * 2.2) * 0.045;
        float.rotation.z = Math.sin(time * 2.4) * 0.06;
      } else {
        float.rotation.z = 0;
      }

      targetWorld.set(targetX, targetY, targetZ);
      tipAnchor.getWorldPosition(tipWorld);
      localEnd.copy(targetWorld);
      tipAnchor.worldToLocal(localEnd);

      const minDrop = 0.12;
      if (localEnd.y > -minDrop) localEnd.y = -minDrop;

      float.position.copy(localEnd);
      updateLine(localEnd);
      orientFloatUpright();
    },
    dispose: () => {
      top.geometry.dispose();
      bottom.geometry.dispose();
      topMat.dispose();
      botMat.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
    },
  };
}
