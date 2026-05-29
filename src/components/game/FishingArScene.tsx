import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { FishingPhase } from "@/lib/game/action-context";
import type { FishKey } from "@/lib/game/useFishingSession";
import { fishAssetForKey } from "@/lib/game/fishing-assets";
import { createFishingBobber } from "./fishing/FishingBobber";
import { createFishShadow } from "./fishing/createFishShadow";
import { createFishingParticles } from "./fishing/createFishingParticles";
import { createFishingPond, type PondPhase } from "./fishing/createFishingPond";
import { createCaughtFishActor } from "./fishing/createCaughtFishActor";
import {
  alignRodModelToCameraRig,
  createProceduralFishingRod,
  ensureRodTipAnchor,
  rodRigLayoutForViewport,
} from "./fishing/createFishingRod";
import { bobberAimAngles, computeRodMotion } from "./fishing/rodMotion";
import { isFishingDebugEnabled, shouldUseRodGlb } from "./fishing/fishingRodPolicy";
import {
  evaluateRodGlbActivation,
  logRodGlbActivationFailure,
  prepareRodGlbMeshes,
} from "./fishing/rodGlbActivation";
import { PROCEDURAL_ROD_LENGTH, rodNdcTargetsForTier } from "./fishing/rodScreenLayout";
import { logRodGripTipNdc, logRodScreenBBox } from "./fishing/rodScreenDebug";
import { fishingViewportLayout } from "./fishing/fishingViewport";

export type FishingVisualPhase =
  | FishingPhase
  | "hook_success"
  | "fish_breach"
  | "fish_land"
  | "fish_flop"
  | "capture_confirm";

export interface FishingArSceneProps {
  phase: FishingVisualPhase;
  bobberX: number;
  bobberY: number;
  /** 0..1 캐스팅 차지 (casting 중 wind-up) */
  castPower?: number;
  /** 0..1 힘겨루기 장력 (fighting 흔들림 강도) */
  tension?: number;
  fishGlbUrl?: string | null;
  rodGlbUrl?: string | null;
  fishKey?: FishKey | null;
  fishRarity?: "common" | "rare" | "legendary";
  showCatch?: boolean;
  onCinematicDone?: () => void;
  onDebugModelStatus?: (status: {
    fish: "idle" | "loaded" | "failed";
    rod: "idle" | "loading" | "glb" | "procedural" | "failed";
    fishUrl: string | null;
    rodUrl: string | null;
  }) => void;
}

function toPondPhase(phase: FishingVisualPhase): PondPhase {
  if (phase === "spot_select") return "ready";
  if (phase === "floating") return "waiting";
  if (
    phase === "reward" ||
    phase === "hook_success" ||
    phase === "fish_breach" ||
    phase === "fish_land" ||
    phase === "fish_flop" ||
    phase === "capture_confirm"
  ) {
    return "caught";
  }
  if (
    phase === "ready" ||
    phase === "casting" ||
    phase === "waiting" ||
    phase === "bite" ||
    phase === "fighting" ||
    phase === "escaped"
  ) {
    return phase;
  }
  return "ready";
}

export function FishingArScene(props: FishingArSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<PondPhase>(toPondPhase(props.phase));
  const bobberRef = useRef({ x: props.bobberX, y: props.bobberY });
  const tensionRef = useRef(props.tension ?? 0);
  const castPowerRef = useRef(props.castPower ?? 0);
  const showCatchRef = useRef(!!props.showCatch);
  const rodGlbUrlRef = useRef<string | null>(props.rodGlbUrl ?? null);
  const visualPhaseRef = useRef<FishingVisualPhase>(props.phase);
  const fishGlbRef = useRef<string | null>(props.fishGlbUrl ?? null);
  const fishKeyRef = useRef<FishKey | null>(props.fishKey ?? null);
  const onCinematicDoneRef = useRef<(() => void) | undefined>(props.onCinematicDone);
  const onDebugModelStatusRef = useRef<FishingArSceneProps["onDebugModelStatus"]>(
    props.onDebugModelStatus,
  );

  phaseRef.current = toPondPhase(props.phase);
  bobberRef.current = { x: props.bobberX, y: props.bobberY };
  castPowerRef.current = props.castPower ?? 0;
  tensionRef.current = props.tension ?? 0;
  showCatchRef.current = !!props.showCatch;
  rodGlbUrlRef.current = props.rodGlbUrl ?? null;
  visualPhaseRef.current = props.phase;
  fishGlbRef.current = props.fishGlbUrl ?? null;
  fishKeyRef.current = props.fishKey ?? null;
  onCinematicDoneRef.current = props.onCinematicDone;
  onDebugModelStatusRef.current = props.onDebugModelStatus;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    renderer.setClearAlpha(0);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.pointerEvents = "none";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      66,
      (container.clientWidth || 1) / Math.max(1, container.clientHeight || 1),
      0.02,
      28,
    );
    // 원점 고정 시 근거리 오브젝트가 frustum 밖으로 나가므로 살짝 뒤로 둔다.
    camera.position.set(0, 0.08, 0.72);
    camera.lookAt(0, -0.42, -2.6);
    scene.add(camera);

    scene.add(new THREE.AmbientLight(0xffffff, 0.78));
    const dir = new THREE.DirectionalLight(0xe0f2fe, 0.85);
    dir.position.set(1.4, 2.3, 1.8);
    scene.add(dir);
    const rodFill = new THREE.DirectionalLight(0xfff7ed, 0.55);
    rodFill.position.set(0.2, 0.6, 0.5);
    camera.add(rodFill);

    const pond = createFishingPond();
    const bobber = createFishingBobber();
    const fishShadow = createFishShadow();
    const particles = createFishingParticles();
    const fishAsset = fishAssetForKey(fishKeyRef.current);
    const caughtActor = createCaughtFishActor({
      preset: fishAsset?.animationPreset ?? "fish_flop_default",
      defaultScale: fishAsset?.scale ?? 0.9,
      floorY: -0.62,
    });
    scene.add(pond.mesh);
    scene.add(fishShadow.mesh);
    scene.add(particles.points);
    scene.add(caughtActor.group);
    const rodAnchor = new THREE.Group();
    rodAnchor.frustumCulled = false;
    rodAnchor.visible = true;
    rodAnchor.renderOrder = 12;
    camera.add(rodAnchor);

    const debugFishing = isFishingDebugEnabled();
    let debugRodLogCooldown = 0;

    const loader = new GLTFLoader();
    let rodObject: THREE.Object3D | null = null;
    let proceduralRod: ReturnType<typeof createProceduralFishingRod> | null = null;
    let usingProceduralRod = false;
    let disposed = false;
    let rodStatus: "idle" | "loading" | "glb" | "procedural" | "failed" = "idle";
    let fishStatus: "idle" | "loaded" | "failed" = "idle";
    let lastFishUrl: string | null = null;
    let lastRodUrl: string | null = rodGlbUrlRef.current ?? null;
    let rodLoadInFlight: string | null = null;
    const emitStatus = () => {
      onDebugModelStatusRef.current?.({
        fish: fishStatus,
        rod: rodStatus,
        fishUrl: lastFishUrl,
        rodUrl: lastRodUrl,
      });
    };
    const bindBobberToTip = (tip: THREE.Object3D | null) => {
      bobber.attachToRodTip(tip);
    };

    const disposeGlbRod = () => {
      if (!rodObject) return;
      rodAnchor.remove(rodObject);
      rodObject.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      rodObject = null;
    };

    const ensureProceduralRod = () => {
      if (disposed) return;
      if (!proceduralRod) {
        proceduralRod = createProceduralFishingRod();
        rodAnchor.add(proceduralRod.group);
        usingProceduralRod = true;
        rodStatus = "procedural";
        emitStatus();
      }
      proceduralRod.group.visible = rodStatus !== "glb";
      rodAnchor.visible = true;
      bindBobberToTip(proceduralRod.tipAnchor);
    };

    const preferProceduralRod = () => {
      disposeGlbRod();
      usingProceduralRod = false;
      ensureProceduralRod();
    };

    const rodBasePos = new THREE.Vector3();
    const rodBaseRot = new THREE.Euler(0, 0, 0, "YXZ");
    const rodBaseQuat = new THREE.Quaternion();
    const rodMotionQuat = new THREE.Quaternion();
    const rodMotionEuler = new THREE.Euler(0, 0, 0, "YXZ");
    let rodBaseScale = 1;
    let rodMotionScale = 1;

    const applyRodAnchorLayout = (layout: ReturnType<typeof fishingViewportLayout>) => {
      const rig = layout.rod;
      rodBasePos.copy(rig.position);
      rodBaseRot.copy(rig.rotation);
      rodBaseQuat.copy(rig.quaternion);
      rodBaseScale = rig.scale;
      rodMotionScale = layout.rodMotionScale;
      rodAnchor.position.copy(rodBasePos);
      rodAnchor.quaternion.copy(rodBaseQuat);
      rodAnchor.scale.setScalar(rodBaseScale);
      if (proceduralRod) {
        proceduralRod.group.scale.setScalar(layout.rodModelLength / PROCEDURAL_ROD_LENGTH);
      }

      if (isFishingDebugEnabled()) {
        camera.updateMatrixWorld(true);
        rodAnchor.updateMatrixWorld(true);
        const targets = rodNdcTargetsForTier(layout.tier);
        logRodGripTipNdc(camera, rodAnchor, layout.rodModelLength, `layout-${layout.tier}`, {
          grip: targets.gripNdc,
          tip: targets.tipNdc,
        });
      }
    };

    const tryActivateGlbRod = (candidate: THREE.Object3D, rw: number, rh: number): boolean => {
      const layout = fishingViewportLayout(rw, rh);
      applyRodAnchorLayout(layout);
      camera.updateMatrixWorld(true);
      rodAnchor.updateMatrixWorld(true);

      alignRodModelToCameraRig(candidate, { targetLength: layout.rodModelLength });
      prepareRodGlbMeshes(candidate);

      rodAnchor.add(candidate);
      candidate.updateMatrixWorld(true);

      const activation = evaluateRodGlbActivation(camera, candidate);
      if (!activation.ok) {
        rodAnchor.remove(candidate);
        logRodGlbActivationFailure(activation.reason, {
          meshCount: activation.meshCount,
          ndc: activation.ndc,
          tier: layout.tier,
        });
        return false;
      }

      disposeGlbRod();
      rodObject = candidate;
      bindBobberToTip(ensureRodTipAnchor(rodObject));
      usingProceduralRod = false;
      rodStatus = "glb";
      if (proceduralRod) proceduralRod.group.visible = false;
      emitStatus();

      if (isFishingDebugEnabled()) {
        const targets = rodNdcTargetsForTier(layout.tier);
        logRodGripTipNdc(camera, rodAnchor, layout.rodModelLength, `glb-${layout.tier}`, {
          grip: targets.gripNdc,
          tip: targets.tipNdc,
        });
        logRodScreenBBox(camera, rodObject, `glb-${layout.tier}`);
      }
      return true;
    };

    const loadRod = (url: string) => {
      const rw = container.clientWidth || window.innerWidth;
      const rh = container.clientHeight || window.innerHeight;
      if (!shouldUseRodGlb()) {
        preferProceduralRod();
        return;
      }
      ensureProceduralRod();
      rodStatus = "loading";
      emitStatus();
      if (rodLoadInFlight === url) return;
      rodLoadInFlight = url;
      lastRodUrl = url;
      loader.load(
        url,
        (gltf) => {
          if (disposed) return;
          rodLoadInFlight = null;
          if (!shouldUseRodGlb()) {
            preferProceduralRod();
            return;
          }

          const candidate = gltf.scene.clone(true);
          if (!tryActivateGlbRod(candidate, rw, rh)) {
            preferProceduralRod();
            return;
          }
        },
        undefined,
        () => {
          rodLoadInFlight = null;
          rodStatus = "failed";
          preferProceduralRod();
        },
      );
    };

    const syncRodSource = () => {
      ensureProceduralRod();
      const url = rodGlbUrlRef.current;
      if (url && shouldUseRodGlb()) loadRod(url);
    };

    syncRodSource();

    const clock = new THREE.Clock();
    let raf = 0;
    let prevPhase: PondPhase = phaseRef.current;
    let prevVisualPhase: FishingVisualPhase = visualPhaseRef.current;
    let cinematicStep: "none" | "breach" | "land" | "flop" | "captured" = "none";
    let cinematicTimer = 0;
    let didCallDone = false;

    let castSwingElapsed = 0;
    let prevMotionPhase: PondPhase | "floating" = phaseRef.current;
    let baseCameraFov = 64;
    let smoothAimYaw = 0;
    let smoothAimPitch = 0;

    const updateViewportLayout = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const layout = fishingViewportLayout(w, h);
      const floorY = -0.62 + layout.floorYOffset;

      baseCameraFov = layout.camera.fov;
      camera.fov = baseCameraFov;
      camera.position.copy(layout.camera.position);
      camera.lookAt(layout.camera.lookAt);
      camera.updateProjectionMatrix();

      pond.mesh.position.y = floorY + 0.04;
      pond.setViewportLayout(layout.pond.meshScale, layout.pond.positionZ);
      caughtActor.setFloorY(floorY);
      caughtActor.setViewportLayout(layout.caughtFish);
      bobber.setPondSurfaceY(floorY + 0.02);
      bobber.setViewportLayout(layout.bobber);
      fishShadow.setViewportLayout(layout.fishShadow);
      fishShadow.setFloorY(floorY);

      applyRodAnchorLayout(layout);
      if (rodObject && !usingProceduralRod) {
        alignRodModelToCameraRig(rodObject, { targetLength: layout.rodModelLength });
        bindBobberToTip(ensureRodTipAnchor(rodObject));
      }
    };

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      updateViewportLayout();
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(0.05, clock.getDelta());
      const t = performance.now() / 1000;
      const phase = phaseRef.current;
      const visualPhase = visualPhaseRef.current;
      const rw = container.clientWidth || window.innerWidth;
      const rh = container.clientHeight || window.innerHeight;
      const rodUrl = rodGlbUrlRef.current;
      if (!proceduralRod) ensureProceduralRod();
      if (rodUrl && rodUrl !== lastRodUrl && shouldUseRodGlb() && rodStatus !== "failed") {
        rodStatus = "idle";
        loadRod(rodUrl);
      }

      rodAnchor.visible = true;
      if (proceduralRod) {
        proceduralRod.group.visible = rodStatus !== "glb";
      }
      const activeFishAsset = fishAssetForKey(fishKeyRef.current);
      const fishModelUrl = fishGlbRef.current ?? activeFishAsset?.modelUrl ?? null;
      if (fishModelUrl) {
        if (lastFishUrl !== fishModelUrl) {
          lastFishUrl = fishModelUrl;
          fishStatus = "idle";
          emitStatus();
        }
        caughtActor.loadModel(fishModelUrl);
      }
      const nextFishStatus = caughtActor.getLoadStatus();
      if (nextFishStatus !== fishStatus) {
        fishStatus = nextFishStatus;
        emitStatus();
      }
      if (activeFishAsset?.animationPreset) {
        caughtActor.setPreset(activeFishAsset.animationPreset);
      }
      if (activeFishAsset?.scale) {
        caughtActor.setScale(activeFishAsset.scale);
      }

      if (phase !== prevPhase) {
        if (phase === "bite") navigator.vibrate?.([30, 20, 60]);
        if (phase === "capture_confirm") {
          navigator.vibrate?.([50, 30, 80]);
          particles.splash();
        }
        if (phase === "escaped") navigator.vibrate?.([20, 60, 20]);
        prevPhase = phase;
      }
      if (visualPhase !== prevVisualPhase) {
        didCallDone = false;
        if (visualPhase === "hook_success") {
          cinematicStep = "breach";
          cinematicTimer = 0;
          caughtActor.setState("breach");
        } else if (visualPhase === "fish_breach") {
          cinematicStep = "breach";
          cinematicTimer = 0;
          caughtActor.setState("breach");
        } else if (visualPhase === "fish_land") {
          cinematicStep = "land";
          cinematicTimer = 0;
          caughtActor.setState("land");
        } else if (visualPhase === "fish_flop") {
          cinematicStep = "flop";
          cinematicTimer = 0;
          caughtActor.setState("flop");
        } else if (visualPhase === "capture_confirm") {
          cinematicStep = "captured";
          cinematicTimer = 0;
          caughtActor.setState("captured");
        } else if (visualPhase === "escaped") {
          cinematicStep = "none";
          caughtActor.setState("escape");
        } else if (
          visualPhase === "waiting" ||
          visualPhase === "bite" ||
          visualPhase === "fighting" ||
          visualPhase === "ready" ||
          visualPhase === "casting" ||
          visualPhase === "floating"
        ) {
          cinematicStep = "none";
          caughtActor.setState("hidden");
        }
        prevVisualPhase = visualPhase;
      }

      if (cinematicStep !== "none") {
        cinematicTimer += dt;
        if (cinematicStep === "breach" && cinematicTimer >= 0.58) {
          cinematicStep = "land";
          cinematicTimer = 0;
          caughtActor.setState("land");
        } else if (cinematicStep === "land" && cinematicTimer >= 0.45) {
          cinematicStep = "flop";
          cinematicTimer = 0;
          caughtActor.setState("flop");
        } else if (cinematicStep === "flop" && cinematicTimer >= 2.0) {
          cinematicStep = "captured";
          cinematicTimer = 0;
          caughtActor.setState("captured");
        } else if (cinematicStep === "captured" && cinematicTimer >= 0.66) {
          cinematicStep = "none";
          caughtActor.setState("hidden");
          if (!didCallDone) {
            onCinematicDoneRef.current?.();
            didCallDone = true;
          }
        }
      }

      const pondTension =
        phase === "fighting" ? tensionRef.current : tensionRef.current * (1 - Math.min(1, dt * 2));

      const motionPhase: PondPhase | "floating" = visualPhase === "floating" ? "floating" : phase;

      if (motionPhase === "floating" && prevMotionPhase !== "floating") {
        castSwingElapsed = 0;
      }
      if (motionPhase === "floating") {
        castSwingElapsed += dt;
      } else if (motionPhase !== "casting") {
        castSwingElapsed = 0;
      }
      prevMotionPhase = motionPhase;

      const aimTarget = bobberAimAngles(bobberRef.current.x, bobberRef.current.y, motionPhase);
      const aimLerp = Math.min(1, dt * (motionPhase === "bite" ? 14 : 7));
      smoothAimYaw += (aimTarget.yaw - smoothAimYaw) * aimLerp;
      smoothAimPitch += (aimTarget.pitch - smoothAimPitch) * aimLerp;

      let fovPulse = 0;
      if (motionPhase === "casting") {
        fovPulse = castPowerRef.current * 5;
      } else if (motionPhase === "floating") {
        const swingT = Math.min(1, castSwingElapsed / 0.42);
        fovPulse = 3.5 * (1 - swingT * swingT);
      } else if (motionPhase === "fighting") {
        fovPulse = 1.5 + pondTension * 2.8;
      } else if (motionPhase === "bite") {
        fovPulse = 2.2 + Math.sin(t * 24) * 0.35;
      }
      camera.fov = baseCameraFov + fovPulse;
      camera.updateProjectionMatrix();

      const rodMotion = computeRodMotion({
        phase: motionPhase,
        castPower: castPowerRef.current,
        tension: pondTension,
        time: t,
        dt,
        castSwingElapsed,
        aimYaw: smoothAimYaw,
        aimPitch: smoothAimPitch,
      });

      pond.update(t, phase, pondTension);
      bobber.update(t, phase, bobberRef.current.x, bobberRef.current.y);
      fishShadow.update(t, phase, caughtActor.getState() !== "hidden");
      particles.update(dt, phase);
      caughtActor.update(dt);
      rodAnchor.position.set(
        rodBasePos.x + rodMotion.offsetX * rodMotionScale,
        rodBasePos.y + rodMotion.offsetY * rodMotionScale,
        rodBasePos.z + rodMotion.offsetZ * rodMotionScale,
      );
      rodMotionEuler.set(
        rodMotion.pitch * rodMotionScale,
        rodMotion.yaw * rodMotionScale,
        rodMotion.roll * rodMotionScale,
        "YXZ",
      );
      rodMotionQuat.setFromEuler(rodMotionEuler);
      rodAnchor.quaternion.copy(rodBaseQuat).multiply(rodMotionQuat);

      if (debugFishing) {
        debugRodLogCooldown -= dt;
        if (debugRodLogCooldown <= 0) {
          debugRodLogCooldown = 2;
          const rodRoot =
            proceduralRod?.group && (usingProceduralRod || !rodObject)
              ? proceduralRod.group
              : (rodObject ?? rodAnchor);
          logRodScreenBBox(camera, rodRoot, phase);
        }
      }

      if ((phase === "capture_confirm" || showCatchRef.current) && Math.random() < 0.1) {
        particles.splash();
      }

      renderer.render(scene, camera);
    };
    animate();
    updateViewportLayout();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      disposeGlbRod();
      if (proceduralRod) {
        rodAnchor.remove(proceduralRod.group);
        proceduralRod.dispose();
        proceduralRod = null;
      }
      bindBobberToTip(null);
      particles.dispose();
      fishShadow.dispose();
      bobber.dispose();
      caughtActor.dispose();
      pond.dispose();
      renderer.dispose();
      try {
        container.removeChild(renderer.domElement);
      } catch {
        // no-op
      }
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 z-[6]" aria-hidden />;
}
