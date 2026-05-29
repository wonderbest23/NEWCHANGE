/**
 * WebXR AR hit-test PoC (Phase 4).
 * Session 미연결 시 HeuristicAnchorProvider fallback.
 */

import { WebXRAnchorProvider } from "@/lib/ar/AnchorProvider";

export async function isWebXRArSupported(): Promise<boolean> {
  return WebXRAnchorProvider.isSupported();
}

export function createWebXRAnchorProvider(): WebXRAnchorProvider {
  return new WebXRAnchorProvider();
}
