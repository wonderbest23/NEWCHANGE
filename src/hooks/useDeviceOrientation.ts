import { useCallback, useEffect, useState } from "react";

type Offset = { x: number; y: number };

export function useDeviceOrientation(enabled: boolean) {
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [needsPermission, setNeedsPermission] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (!window.DeviceOrientationEvent) return;

    const req = (
      window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    ).requestPermission;
    if (typeof req === "function") {
      setNeedsPermission(true);
    } else {
      setListening(true);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !listening) return;

    const onOrient = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0;
      const beta = e.beta ?? 45;
      setOffset({
        x: Math.max(-60, Math.min(60, gamma * 2.2)),
        y: Math.max(-40, Math.min(40, (beta - 50) * 1.4)),
      });
    };

    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [enabled, listening]);

  const requestPermission = useCallback(async () => {
    const req = (
      window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    ).requestPermission;
    if (!req) {
      setListening(true);
      setNeedsPermission(false);
      return true;
    }
    try {
      const result = await req();
      if (result === "granted") {
        setNeedsPermission(false);
        setListening(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  return { offset, needsPermission, requestPermission };
}
