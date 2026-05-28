import { useCallback, useEffect, useState } from "react";

type Offset = { x: number; y: number };

/**
 * Device orientation hook.
 *
 * 반환:
 *  - offset: 자이로 기반 픽셀 오프셋 (작은 시차/패럴랙스용 — 기존 사용처 호환)
 *  - heading: 0~360°. 기기가 향하는 방위(나침반). 사용 불가 시 null.
 *      iOS Safari: webkitCompassHeading (true north).
 *      Android Chrome: deviceorientationabsolute (alpha) — magnetic.
 *  - needsPermission / requestPermission: iOS 13+ 권한 모델 처리
 */
export function useDeviceOrientation(enabled: boolean) {
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [heading, setHeading] = useState<number | null>(null);
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

      // 나침반: iOS webkitCompassHeading 우선, 그 외는 absolute alpha.
      // alpha: 360 - alpha 가 자기 북 (Android Chrome 표준).
      const iosHeading = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof iosHeading === "number" && Number.isFinite(iosHeading)) {
        setHeading(iosHeading);
      } else if (typeof e.alpha === "number" && Number.isFinite(e.alpha)) {
        // alpha = 기기 z 축 회전. 0=north when absolute=true. Android는 보통 absolute=true.
        const h = 360 - e.alpha;
        setHeading(((h % 360) + 360) % 360);
      }
    };

    // absolute 이벤트가 있으면 그것을 쓰는 게 더 정확 (자기북 기준).
    const hasAbsolute = "ondeviceorientationabsolute" in window;
    const eventName = hasAbsolute ? "deviceorientationabsolute" : "deviceorientation";

    window.addEventListener(eventName, onOrient as EventListener);
    return () => window.removeEventListener(eventName, onOrient as EventListener);
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

  return { offset, heading, needsPermission, requestPermission };
}
