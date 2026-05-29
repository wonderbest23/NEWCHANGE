import * as THREE from "three";
import type { PondPhase } from "./createFishingPond";

const CAPACITY = 40;

type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  ttl: number;
};

export function createFishingParticles() {
  const particles: Particle[] = [];
  const positions = new Float32Array(CAPACITY * 3);
  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  geometry.setAttribute("position", posAttr);

  const material = new THREE.PointsMaterial({
    color: new THREE.Color("#dbeafe"),
    size: 0.045,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 7;

  function spawn(count: number, burst = false) {
    for (let i = 0; i < count && particles.length < CAPACITY; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = burst ? Math.random() * 0.22 : Math.random() * 0.7;
      particles.push({
        x: Math.cos(angle) * radius,
        y: -1.28 + (Math.random() - 0.5) * 0.1,
        z: -3.2 + Math.sin(angle) * radius * 0.2,
        vx: (Math.random() - 0.5) * (burst ? 0.9 : 0.08),
        vy: burst ? 0.6 + Math.random() * 0.7 : 0.08 + Math.random() * 0.16,
        vz: (Math.random() - 0.5) * (burst ? 0.2 : 0.05),
        life: 0,
        ttl: burst ? 0.8 + Math.random() * 0.4 : 1.4 + Math.random() * 1.1,
      });
    }
  }

  return {
    points,
    update: (dt: number, phase: PondPhase) => {
      if (phase === "waiting" && Math.random() < 0.05) spawn(1);
      if (phase === "bite" && Math.random() < 0.2) spawn(2);
      if (phase === "fighting" && Math.random() < 0.14) spawn(2);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 0.18 * dt;
        if (p.life >= p.ttl) particles.splice(i, 1);
      }

      for (let i = 0; i < CAPACITY; i++) {
        if (i < particles.length) {
          const p = particles[i];
          positions[i * 3] = p.x;
          positions[i * 3 + 1] = p.y;
          positions[i * 3 + 2] = p.z;
        } else {
          positions[i * 3] = 0;
          positions[i * 3 + 1] = -999;
          positions[i * 3 + 2] = 0;
        }
      }
      posAttr.needsUpdate = true;
      material.opacity =
        phase === "bite" || phase === "fighting" ? 0.92 : phase === "escaped" ? 0.4 : 0.75;
    },
    splash: () => spawn(16, true),
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
