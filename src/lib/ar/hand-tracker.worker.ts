/// <reference lib="webworker" />
/**
 * Hand tracking worker — MediaPipe HandLandmarker.
 *
 * 메인 스레드 → ImageBitmap frame → 손 랜드마크 + 간단 제스처 분류 반환.
 * 분류는 본 worker 안에서 손가락 굽힘/펼침 휴리스틱만 (정밀 분류는 추후 모델).
 *
 * 메시지:
 *   in  { type: "init" }
 *   in  { type: "frame", bitmap, ts, requestId }
 *   out { type: "ready" | "error" | "result", ... }
 */

import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

export type HandGesture =
  | "open_palm" // 손바닥 펼침
  | "fist"      // 주먹
  | "pointing"  // 검지 가리키기
  | "victory"   // V자
  | "thumb_up"  // 엄지 척
  | "none";

export interface HandTrackingDTO {
  /** 첫 손 기준. 화면 정규화 좌표 (x: 0~1, y: 0~1). */
  x: number;
  y: number;
  gesture: HandGesture;
  /** 검출 confidence (0..1). */
  confidence: number;
}

let landmarker: HandLandmarker | null = null;
let initializing = false;

async function ensure(): Promise<void> {
  if (landmarker || initializing) return;
  initializing = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
    );
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
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

// 21개 랜드마크 인덱스 (MediaPipe 공식):
//   wrist=0, thumb_tip=4, index_tip=8, middle_tip=12, ring_tip=16, pinky_tip=20
//   각 손가락 mcp=base, pip, dip, tip 순으로 4개씩.
//   "tip y < pip y" 이면 펼쳐짐 (이미지 좌표는 위가 0).
function classifyGesture(landmarks: Array<{ x: number; y: number; z: number }>): {
  gesture: HandGesture;
  conf: number;
} {
  if (!landmarks || landmarks.length < 21) return { gesture: "none", conf: 0 };
  const lm = landmarks;
  // 각 손가락 펼침 여부
  const indexUp = lm[8].y < lm[6].y;
  const middleUp = lm[12].y < lm[10].y;
  const ringUp = lm[16].y < lm[14].y;
  const pinkyUp = lm[20].y < lm[18].y;
  // 엄지는 x 축 기준 (손이 정면일 때)
  const thumbOpen = Math.abs(lm[4].x - lm[2].x) > 0.05;

  const fingersUp = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;

  if (fingersUp === 0 && !thumbOpen) return { gesture: "fist", conf: 0.8 };
  if (fingersUp === 4) return { gesture: "open_palm", conf: 0.85 };
  if (indexUp && !middleUp && !ringUp && !pinkyUp) return { gesture: "pointing", conf: 0.75 };
  if (indexUp && middleUp && !ringUp && !pinkyUp) return { gesture: "victory", conf: 0.75 };
  if (thumbOpen && !indexUp && !middleUp && !ringUp && !pinkyUp)
    return { gesture: "thumb_up", conf: 0.7 };
  return { gesture: "none", conf: 0.3 };
}

function dtoFromResult(result: HandLandmarkerResult): HandTrackingDTO | null {
  if (!result.landmarks || result.landmarks.length === 0) return null;
  const lm = result.landmarks[0];
  const wrist = lm[0];
  const classification = classifyGesture(lm);
  return {
    x: wrist.x,
    y: wrist.y,
    gesture: classification.gesture,
    confidence: classification.conf,
  };
}

self.addEventListener("message", async (event: MessageEvent) => {
  const msg = event.data as
    | { type: "init" }
    | { type: "frame"; bitmap: ImageBitmap; ts: number; requestId: number };
  if (msg.type === "init") {
    await ensure();
    return;
  }
  if (msg.type === "frame") {
    if (!landmarker) {
      await ensure();
      if (!landmarker) {
        msg.bitmap.close();
        return;
      }
    }
    try {
      const result = landmarker.detectForVideo(msg.bitmap, msg.ts);
      const hand = dtoFromResult(result);
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: "result",
        requestId: msg.requestId,
        hand,
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

void ensure();
