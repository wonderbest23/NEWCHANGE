/**
 * emotion2vec+ SER → 앱 감정 키·세션 요약 타입.
 */

import type { EmotionKey } from "./emotion";

/** emotion2vec+ 9-class 라벨 */
export type Emotion2VecLabel =
  | "angry"
  | "disgusted"
  | "fearful"
  | "happy"
  | "neutral"
  | "other"
  | "sad"
  | "surprised"
  | "unknown";

export type SerVad = {
  valence: number;
  arousal: number;
};

export type SerTurnResult = {
  label: Emotion2VecLabel;
  confidence: number;
  label_scores: Partial<Record<Emotion2VecLabel, number>>;
  app_emotion_key: EmotionKey;
  vad: SerVad;
  model_id?: string;
  step_id?: string | null;
  transcript?: string;
};

export type VoiceSerSessionSummary = {
  method: "emotion2vec_plus_v1" | "emotion2vec_plus_kesdy_v1";
  model_id: string;
  turn_count: number;
  label: Emotion2VecLabel;
  confidence: number;
  label_scores: Partial<Record<Emotion2VecLabel, number>>;
  app_emotion_key: EmotionKey;
  vad: SerVad;
  turns: SerTurnResult[];
  /** 텍스트·브라우저 prosody와 융합된 최종 감정 */
  fused_emotion_key: EmotionKey;
  fusion_source: "multimodal" | "ser" | "browser_fallback" | "text";
};

/** 클라이언트 → 서버 analyze 입력 */
export type VoiceSerTurnClip = {
  stepId?: string;
  transcript: string;
  audioBase64: string;
  mimeType: string;
};

export type VoiceAnalysisBundle = {
  ser?: VoiceSerSessionSummary | null;
  browserProsody?: import("./voice-prosody").VoiceProsodySessionSummary | null;
  fusedEmotionKey: EmotionKey;
  fusionSource: VoiceSerSessionSummary["fusion_source"];
};
