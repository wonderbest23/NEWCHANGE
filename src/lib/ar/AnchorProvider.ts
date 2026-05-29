/**
 * AR 앵커 추상화 — Phase 1 heuristic → Phase 4 WebXR / native.
 */

import { computeGroundScreenY, screenYToWorldY } from "@/lib/ar/groundAnchor";

export type AnchorSource = "heuristic" | "mediapipe" | "webxr" | "native";

export interface AnchorInput {
  renderDepth: number;
  vfovDeg: number;
  pitchRad?: number | null;
  screenAnchor?: { x: number; y: number; size: number; category?: string } | null;
  bearingLateralRad: number;
  anchorTopY?: number;
}

export interface AnchorPose {
  worldX: number;
  worldY: number;
  worldZ: number;
  groundScreenY: number;
  source: AnchorSource;
}

export interface AnchorProvider {
  resolve(input: AnchorInput): AnchorPose;
}

/** Phase 1 — pitch + optional MediaPipe surface. */
export class HeuristicAnchorProvider implements AnchorProvider {
  resolve(input: AnchorInput): AnchorPose {
    const groundScreenY = computeGroundScreenY({
      pitchRad: input.pitchRad,
      anchorTopY: input.anchorTopY ?? input.screenAnchor?.y,
      anchorCategory: input.screenAnchor?.category,
    });
    const worldY = screenYToWorldY(groundScreenY, input.renderDepth, input.vfovDeg);
    const lateralRad = input.bearingLateralRad;
    const z = -Math.cos(lateralRad) * input.renderDepth;
    const x = Math.sin(lateralRad) * input.renderDepth;
    return {
      worldX: x,
      worldY,
      worldZ: z,
      groundScreenY,
      source: input.screenAnchor ? "mediapipe" : "heuristic",
    };
  }
}

/** Phase 4 PoC — WebXR hit-test 미지원 시 heuristic fallback. */
export class WebXRAnchorProvider implements AnchorProvider {
  private fallback = new HeuristicAnchorProvider();

  static async isSupported(): Promise<boolean> {
    if (typeof navigator === "undefined") return false;
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) return false;
    try {
      return await xr.isSessionSupported("immersive-ar");
    } catch {
      return false;
    }
  }

  resolve(input: AnchorInput): AnchorPose {
    // TODO: XRFrame hit-test when immersive-ar session active
    const pose = this.fallback.resolve(input);
    return { ...pose, source: "webxr" };
  }
}

export const defaultAnchorProvider: AnchorProvider = new HeuristicAnchorProvider();
