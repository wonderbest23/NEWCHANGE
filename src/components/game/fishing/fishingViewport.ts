import * as THREE from "three";
import { buildRodRigFromScreen, rodNdcTargetsForTier } from "./rodScreenLayout";

export type RodRigLayout = {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  quaternion: THREE.Quaternion;
  scale: number;
};

/** 모바일 전용 앱 — 폰 세로 vs 태블릿/PC wide */
export type FishingViewportTier = "mobilePortrait" | "tabletPortrait";

export type FishingViewportLayout = {
  tier: FishingViewportTier;
  aspect: number;
  camera: {
    fov: number;
    position: THREE.Vector3;
    lookAt: THREE.Vector3;
  };
  rod: RodRigLayout;
  rodModelLength: number;
  rodMotionScale: number;
  pond: {
    meshScale: THREE.Vector2;
    positionZ: number;
  };
  bobber: {
    xRange: number;
    yRange: number;
    fightingXAmp: number;
    positionZ: number;
  };
  fishShadow: {
    xAmp: number;
    fightingAmp: number;
    positionZ: number;
  };
  caughtFish: {
    z: number;
    scaleMultiplier: number;
    poseScale: number;
    maxPoseX: number;
  };
  floorYOffset: number;
};

const MOBILE_FOV = 66;
const WIDE_FOV = 62;

const POND_MOBILE = {
  meshScale: new THREE.Vector2(1.85, 0.92),
  positionZ: -2.95,
};
const POND_WIDE = {
  meshScale: new THREE.Vector2(2.0, 0.96),
  positionZ: -3.05,
};

/** aspect ≥ 0.72 (태블릿·PC 가로) */
export function getFishingViewportTier(aspect: number): FishingViewportTier {
  if (aspect >= 0.72) return "tabletPortrait";
  return "mobilePortrait";
}

export function fishingViewportLayout(width: number, height: number): FishingViewportLayout {
  const w = Math.max(1, width || 390);
  const h = Math.max(1, height || 844);
  const aspect = w / h;
  const tier = getFishingViewportTier(aspect);
  const floorYOffset = Math.max(-0.05, Math.min(0.12, ((h - 820) / 900) * 0.2));
  const fov = tier === "mobilePortrait" ? MOBILE_FOV : WIDE_FOV;

  const screenRig = buildRodRigFromScreen(fov, aspect, rodNdcTargetsForTier(tier));

  const rod: RodRigLayout = {
    position: screenRig.position,
    rotation: screenRig.rotation,
    quaternion: screenRig.quaternion,
    scale: screenRig.scale,
  };

  const pond = tier === "mobilePortrait" ? POND_MOBILE : POND_WIDE;

  return {
    tier,
    aspect,
    camera: {
      fov,
      position: new THREE.Vector3(0, 0.04, 0.68),
      lookAt: new THREE.Vector3(0, -0.62 + floorYOffset + 0.18, -2.45),
    },
    rod,
    rodModelLength: screenRig.rodModelLength,
    rodMotionScale: tier === "mobilePortrait" ? 0.78 : 0.82,
    pond,
    bobber: {
      xRange: tier === "mobilePortrait" ? 0.95 : 1.25,
      yRange: tier === "mobilePortrait" ? 0.24 : 0.3,
      fightingXAmp: tier === "mobilePortrait" ? 0.22 : 0.32,
      positionZ: pond.positionZ + 0.13,
    },
    fishShadow: {
      xAmp: tier === "mobilePortrait" ? 0.32 : 0.4,
      fightingAmp: tier === "mobilePortrait" ? 0.52 : 0.64,
      positionZ: pond.positionZ - 0.1,
    },
    caughtFish: {
      z: tier === "mobilePortrait" ? -2.15 : -2.3,
      scaleMultiplier: tier === "mobilePortrait" ? 0.74 : 0.85,
      poseScale: tier === "mobilePortrait" ? 0.72 : 0.82,
      maxPoseX: tier === "mobilePortrait" ? 0.1 : 0.15,
    },
    floorYOffset,
  };
}
