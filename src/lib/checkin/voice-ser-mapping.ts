/**
 * emotion2vec+ 9-class → 앱 6 감정 키 매핑.
 */

import type { EmotionKey } from "./emotion";
import type { Emotion2VecLabel } from "./voice-ser.types";

export const EMOTION2VEC_TO_APP: Record<Emotion2VecLabel, EmotionKey> = {
  happy: "joyful",
  neutral: "calm",
  sad: "sad",
  angry: "alert",
  fearful: "anxious",
  surprised: "anxious",
  disgusted: "alert",
  other: "calm",
  unknown: "calm",
};

export const EMOTION2VEC_LABELS: Emotion2VecLabel[] = [
  "angry",
  "disgusted",
  "fearful",
  "happy",
  "neutral",
  "other",
  "sad",
  "surprised",
  "unknown",
];

export function mapEmotion2VecLabel(label: string): EmotionKey {
  const key = label.toLowerCase() as Emotion2VecLabel;
  return EMOTION2VEC_TO_APP[key] ?? "calm";
}

/** KESDy18 4-class (angry/neutral/sad/happy) → 앱 6키 */
export const KESDY_LABEL_TO_APP: Record<string, EmotionKey> = {
  angry: "alert",
  neutral: "calm",
  sad: "sad",
  happy: "joyful",
  fear: "anxious",
  fearfu: "anxious",
  fearful: "anxious",
};

export function mapKesdyLabel(label: string): EmotionKey {
  return KESDY_LABEL_TO_APP[label.toLowerCase()] ?? mapEmotion2VecLabel(label);
}
