/// <reference lib="webworker" />
/**
 * Object detection worker.
 *
 * 메인 스레드에서 보낸 ImageBitmap 프레임을 받아 MediaPipe EfficientDet-Lite0 으로
 * 객체 검출 후 결과만 돌려보낸다. WASM/모델은 CDN 에서 로드 (브라우저 캐시 됨).
 *
 * 메시지 프로토콜:
 *   in  { type: "init" } → 모델 초기화
 *   in  { type: "frame", bitmap: ImageBitmap, ts: number, requestId: number }
 *   out { type: "ready" } | { type: "error", error }
 *   out { type: "result", requestId, detections: Array<DetectionDTO> }
 *
 * 메인 스레드는 한 번에 하나의 in-flight 요청만 보내 backpressure 제어.
 */

import {
  FilesetResolver,
  ObjectDetector,
  type ObjectDetectorResult,
} from "@mediapipe/tasks-vision";

export interface DetectionDTO {
  category: string;
  score: number;
  // 원본 ImageBitmap 픽셀 기준 박스
  x: number;
  y: number;
  width: number;
  height: number;
}

let detector: ObjectDetector | null = null;
let initializing = false;

async function ensureDetector(): Promise<void> {
  if (detector || initializing) return;
  initializing = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
    );
    detector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
        // Worker 안에서는 GPU delegate 가 일부 브라우저에서 불안정 — CPU 가 안전한 디폴트
        delegate: "CPU",
      },
      scoreThreshold: 0.45,
      runningMode: "VIDEO",
      maxResults: 8,
    });
    (self as DedicatedWorkerGlobalScope).postMessage({ type: "ready" });
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    initializing = false;
  }
}

function dtoFromResult(result: ObjectDetectorResult): DetectionDTO[] {
  return result.detections.map((d) => {
    const cat = d.categories?.[0];
    const box = d.boundingBox;
    return {
      category: cat?.categoryName ?? "unknown",
      score: cat?.score ?? 0,
      x: box?.originX ?? 0,
      y: box?.originY ?? 0,
      width: box?.width ?? 0,
      height: box?.height ?? 0,
    };
  });
}

self.addEventListener("message", async (event: MessageEvent) => {
  const msg = event.data as
    | { type: "init" }
    | { type: "frame"; bitmap: ImageBitmap; ts: number; requestId: number };

  if (msg.type === "init") {
    await ensureDetector();
    return;
  }

  if (msg.type === "frame") {
    if (!detector) {
      // 메시지를 빼먹지 않도록 자동 init
      await ensureDetector();
      if (!detector) {
        msg.bitmap.close();
        return;
      }
    }
    try {
      const result = detector.detectForVideo(msg.bitmap, msg.ts);
      const detections = dtoFromResult(result);
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: "result",
        requestId: msg.requestId,
        detections,
      });
    } catch (err) {
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: "error",
        error: err instanceof Error ? err.message : String(err),
        requestId: msg.requestId,
      });
    } finally {
      msg.bitmap.close();
    }
  }
});

// 모듈 시작 시 자동 init (지연 줄이기)
void ensureDetector();
