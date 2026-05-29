/**
 * useObjectDetector — Web Worker 기반 MediaPipe Object Detector React 훅.
 *
 * 사용:
 *   const detector = useObjectDetector({ enabled, video });
 *   detector.latest     // 마지막 검출 결과 (DetectionDTO[]) 또는 null
 *   detector.requestDetection()  // 한 번 검출 요청 (in-flight 가 있으면 무시)
 *
 * 메인 스레드 부담 최소화:
 *  - in-flight 요청 최대 1개
 *  - createImageBitmap 으로 비디오 프레임을 transferable 로 전달
 *  - 호출자(예: ARWalkSession) 가 적절한 빈도로 requestDetection 호출 (예: 600ms 간격)
 *
 * SSR/미지원 환경:
 *  - typeof Worker !== "function" → no-op (latest=null 유지)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DetectionDTO } from "@/lib/ar/object-detector.worker";

export type { DetectionDTO };

export interface UseObjectDetectorOptions {
  enabled: boolean;
  video: HTMLVideoElement | null;
}

export interface UseObjectDetectorReturn {
  ready: boolean;
  latest: DetectionDTO[] | null;
  /** 마지막 검출 결과가 도출된 video frame 시각 (performance.now()). */
  latestTs: number | null;
  requestDetection: () => void;
  error: string | null;
}

export function useObjectDetector(opts: UseObjectDetectorOptions): UseObjectDetectorReturn {
  const { enabled, video } = opts;
  const workerRef = useRef<Worker | null>(null);
  const inflightRef = useRef(false);
  const reqIdRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [latest, setLatest] = useState<DetectionDTO[] | null>(null);
  const [latestTs, setLatestTs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof Worker !== "function") return;

    let cancelled = false;

    // Vite 의 query suffix 기반 worker import. 빌드 시 별도 chunk 로 분리됨.
    const worker = new Worker(
      new URL("./object-detector.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    const onMessage = (e: MessageEvent) => {
      if (cancelled) return;
      const data = e.data as
        | { type: "ready" }
        | { type: "result"; requestId: number; detections: DetectionDTO[] }
        | { type: "error"; error: string; requestId?: number };

      if (data.type === "ready") {
        setReady(true);
        setError(null);
      } else if (data.type === "result") {
        inflightRef.current = false;
        setLatest(data.detections);
        setLatestTs(performance.now());
      } else if (data.type === "error") {
        inflightRef.current = false;
        setError(data.error);
        // 모델 로드 실패 등은 ready=false 유지
      }
    };

    worker.addEventListener("message", onMessage);
    worker.postMessage({ type: "init" });

    return () => {
      cancelled = true;
      worker.removeEventListener("message", onMessage);
      worker.terminate();
      workerRef.current = null;
      setReady(false);
    };
  }, [enabled]);

  const requestDetection = useCallback(() => {
    const worker = workerRef.current;
    if (!worker || !ready || !video) return;
    if (inflightRef.current) return;
    if (video.readyState < 2 /* HAVE_CURRENT_DATA */) return;

    // OffscreenCanvas + createImageBitmap 둘 다 비디오를 받음.
    // createImageBitmap 이 transferable 라 worker 로 zero-copy 전달 가능.
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

  return { ready, latest, latestTs, requestDetection, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// 객체 카테고리 → 몬스터 친화도. 박스 위에 몬스터를 "앉히기" 좋은 객체에 가중치.
//   - 의자/벤치/소파/가방: 몬스터가 위에 앉기 좋음
//   - 화분/식물/책: 옆에 숨기 좋음
//   - 사람/동물: 피하는 게 좋음 (위에 얹으면 어색)
// 가중치 0 은 후보 제외.
// ─────────────────────────────────────────────────────────────────────────────
export const OBJECT_ANCHOR_WEIGHT: Record<string, number> = {
  chair: 1.0,
  bench: 1.0,
  couch: 1.0,
  sofa: 1.0,
  backpack: 0.9,
  handbag: 0.9,
  suitcase: 0.9,
  "potted plant": 0.85,
  "dining table": 0.8,
  bicycle: 0.8,
  "fire hydrant": 0.75,
  bottle: 0.7,
  cup: 0.7,
  book: 0.65,
  laptop: 0.65,
  keyboard: 0.6,
  // 사람/동물 위에는 얹지 않음
  person: 0,
  dog: 0,
  cat: 0,
  bird: 0,
};

export function pickBestAnchor(
  detections: DetectionDTO[],
  videoWidth: number,
  videoHeight: number,
): DetectionDTO | null {
  if (!detections.length) return null;
  // 지면/가구 후보 우선 — 중앙 편향은 최소화 (몬스터가 십자선에만 붙는 현상 방지)
  let best: { d: DetectionDTO; score: number } | null = null;
  const cx = videoWidth / 2;
  const maxDist = Math.hypot(cx, videoHeight / 2);
  for (const d of detections) {
    const w = OBJECT_ANCHOR_WEIGHT[d.category] ?? 0.4; // 알 수 없는 카테고리도 약간 허용
    if (w === 0) continue;
    const bx = d.x + d.width / 2;
    const by = d.y + d.height / 2;
    const distNorm = 1 - Math.min(1, Math.hypot(bx - cx, by - cy) / maxDist);
    const groundNorm = Math.min(1, (by / videoHeight) * 1.15);
    const score = w * 0.5 + d.score * 0.28 + groundNorm * 0.17 + distNorm * 0.05;
    if (!best || score > best.score) best = { d, score };
  }
  return best?.d ?? null;
}
