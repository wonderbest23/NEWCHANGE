/**
 * useHandTracker — Web Worker 기반 MediaPipe HandLandmarker 훅.
 *
 * 600ms 주기 권장 (제스처는 변화 빈도 낮음).
 * 외부에서 requestDetection() 호출 → 결과는 latest 에.
 *
 * 미지원 환경에서는 silent no-op.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { HandTrackingDTO } from "@/lib/ar/hand-tracker.worker";

export type { HandTrackingDTO };

export interface UseHandTrackerOptions {
  enabled: boolean;
  video: HTMLVideoElement | null;
}

export function useHandTracker({ enabled, video }: UseHandTrackerOptions) {
  const workerRef = useRef<Worker | null>(null);
  const inflightRef = useRef(false);
  const reqIdRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [latest, setLatest] = useState<HandTrackingDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof Worker !== "function") return;
    let cancelled = false;
    const worker = new Worker(
      new URL("./hand-tracker.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    const onMsg = (e: MessageEvent) => {
      if (cancelled) return;
      const d = e.data as
        | { type: "ready" }
        | { type: "result"; requestId: number; hand: HandTrackingDTO | null }
        | { type: "error"; error: string };
      if (d.type === "ready") {
        setReady(true);
        setError(null);
      } else if (d.type === "result") {
        inflightRef.current = false;
        setLatest(d.hand);
      } else if (d.type === "error") {
        inflightRef.current = false;
        setError(d.error);
      }
    };
    worker.addEventListener("message", onMsg);
    worker.postMessage({ type: "init" });

    return () => {
      cancelled = true;
      worker.removeEventListener("message", onMsg);
      worker.terminate();
      workerRef.current = null;
      setReady(false);
    };
  }, [enabled]);

  const requestDetection = useCallback(() => {
    const worker = workerRef.current;
    if (!worker || !ready || !video) return;
    if (inflightRef.current) return;
    if (video.readyState < 2) return;
    inflightRef.current = true;
    const ts = performance.now();
    const reqId = ++reqIdRef.current;
    createImageBitmap(video)
      .then((bitmap) => {
        worker.postMessage({ type: "frame", bitmap, ts, requestId: reqId }, [bitmap]);
      })
      .catch((err) => {
        inflightRef.current = false;
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [ready, video]);

  return { ready, latest, error, requestDetection };
}
