/**
 * Asset3DViewer — Three.js 로 GLB 자산을 작은 canvas 에 렌더.
 *
 * 자동 회전 + 적절한 카메라 거리 자동 fit.
 * AssetPreview 가 lazy 로 import 한다 (Three.js 번들 무거움).
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

interface Props {
  glbUrl: string;
  size: number;
  autoRotate?: boolean;
}

const loader = new GLTFLoader();

export function Asset3DViewer({ glbUrl, size, autoRotate = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    camera.position.set(0, 0, 3);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2, 3, 4);
    scene.add(dir);

    let group: THREE.Group | null = null;
    let rafId = 0;
    let cancelled = false;

    loader.load(
      glbUrl,
      (gltf) => {
        if (cancelled) return;
        group = gltf.scene;

        // Bounding box 로 모델 자동 fit
        const box = new THREE.Box3().setFromObject(group);
        const sizeVec = new THREE.Vector3();
        box.getSize(sizeVec);
        const center = new THREE.Vector3();
        box.getCenter(center);
        group.position.sub(center); // 중심을 원점으로
        const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
        const scale = 1.6 / Math.max(0.01, maxDim);
        group.scale.setScalar(scale);

        scene.add(group);

        const animate = () => {
          if (cancelled) return;
          rafId = requestAnimationFrame(animate);
          if (autoRotate && group) {
            group.rotation.y += 0.012;
            group.rotation.x = Math.sin(Date.now() / 1800) * 0.08;
          }
          renderer.render(scene, camera);
        };
        animate();
      },
      undefined,
      (err) => {
        console.warn("[Asset3DViewer] GLB load failed", err);
      },
    );

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      renderer.dispose();
      try {
        container.removeChild(renderer.domElement);
      } catch {
        /* detached */
      }
    };
  }, [glbUrl, size, autoRotate]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ width: size, height: size }}
    />
  );
}
