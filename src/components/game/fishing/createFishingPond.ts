import * as THREE from "three";
import { waterFragmentShader, waterVertexShader } from "./waterShader";

export type PondPhase =
  | "ready"
  | "casting"
  | "waiting"
  | "bite"
  | "fighting"
  | "caught"
  | "escaped";

export function createFishingPond() {
  const geometry = new THREE.PlaneGeometry(3.8, 1.75, 64, 32);

  const material = new THREE.ShaderMaterial({
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uPhaseStrength: { value: 1 },
      uRippleStrength: { value: 1 },
      uOpacity: { value: 0.45 },
      uColorA: { value: new THREE.Color("#0891b2") },
      uColorB: { value: new THREE.Color("#67e8f9") },
    },
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, -1.15, -3.2);
  mesh.rotation.x = -0.18;
  mesh.scale.set(2.2, 1.0, 1);
  mesh.renderOrder = 3;

  return {
    mesh,
    material,
    setViewportLayout: (meshScale: THREE.Vector2, positionZ: number) => {
      mesh.scale.set(meshScale.x, meshScale.y, 1);
      mesh.position.z = positionZ;
    },
    update: (time: number, phase: PondPhase, tension = 0) => {
      material.uniforms.uTime.value = time;

      if (phase === "bite") {
        material.uniforms.uRippleStrength.value = 2.2;
        material.uniforms.uPhaseStrength.value = 2.0;
        material.uniforms.uOpacity.value = 0.56;
      } else if (phase === "fighting") {
        material.uniforms.uRippleStrength.value = 1.6 + Math.min(0.8, tension);
        material.uniforms.uPhaseStrength.value = 1.4;
        material.uniforms.uOpacity.value = 0.52;
      } else if (phase === "caught") {
        material.uniforms.uRippleStrength.value = 2.8;
        material.uniforms.uPhaseStrength.value = 2.4;
        material.uniforms.uOpacity.value = 0.62;
      } else if (phase === "escaped") {
        material.uniforms.uRippleStrength.value = 0.55;
        material.uniforms.uPhaseStrength.value = 0.7;
        material.uniforms.uOpacity.value = 0.36;
      } else {
        material.uniforms.uRippleStrength.value = 0.85;
        material.uniforms.uPhaseStrength.value = 0.9;
        material.uniforms.uOpacity.value = 0.42;
      }
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
