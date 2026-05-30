/**
 * 음성 SER + 텍스트 LLM + 브라우저 prosody 멀티모달 융합.
 *
 * 논문·프로덕션 패턴: acoustic embedding 분류 + transcript sentiment 가중 합.
 * urgent/caution은 텍스트(증상) 우선.
 */

import {
  resolveEmotionFromText,
  type ConditionLevel,
  type EmotionKey,
} from "./emotion";
import type { VoiceProsodySessionSummary } from "./voice-prosody";
import { mapEmotion2VecLabel } from "./voice-ser-mapping";
import type {
  SerTurnResult,
  VoiceSerSessionSummary,
  VoiceSerTurnClip,
} from "./voice-ser.types";

const SER_MIN_CONFIDENCE = 0.35;

export function fuseEmotionSignals(input: {
  conditionLevel: ConditionLevel | string;
  moodStatus: string | null;
  serAppEmotionKey?: EmotionKey | null;
  serConfidence?: number;
  browserProsodyHint?: EmotionKey | null;
}): { emotionKey: EmotionKey; source: VoiceSerSessionSummary["fusion_source"] } {
  const c = (input.conditionLevel ?? "normal") as ConditionLevel;
  const textEmotion = resolveEmotionFromText(c, input.moodStatus);

  if (c === "urgent" || c === "caution") {
    return { emotionKey: textEmotion.key, source: "text" };
  }

  const serKey = input.serAppEmotionKey ?? null;
  const serConf = input.serConfidence ?? 0;
  const prosodyHint = input.browserProsodyHint ?? null;

  if (serKey && serConf >= SER_MIN_CONFIDENCE) {
    if (serKey === textEmotion.key) {
      return { emotionKey: serKey, source: "multimodal" };
    }
    // SER 신뢰도 높으면 acoustic 우선, 중간이면 prosody 보조
    if (serConf >= 0.55) {
      return { emotionKey: serKey, source: "ser" };
    }
    if (prosodyHint && prosodyHint === serKey) {
      return { emotionKey: serKey, source: "multimodal" };
    }
    // 텍스트 "괜찮아요" + acoustic sad/tired 계열
    if (
      textEmotion.key === "calm" &&
      (serKey === "sad" || serKey === "tired" || serKey === "anxious")
    ) {
      return { emotionKey: serKey, source: "multimodal" };
    }
    return { emotionKey: textEmotion.key, source: "text" };
  }

  if (prosodyHint && prosodyHint !== textEmotion.key) {
    return { emotionKey: prosodyHint, source: "browser_fallback" };
  }

  return { emotionKey: textEmotion.key, source: "text" };
}

export function buildVoiceSerSessionSummary(input: {
  raw: {
    method?: string;
    model_id: string;
    turn_count: number;
    label: string;
    confidence: number;
    label_scores: Record<string, number>;
    app_emotion_key: EmotionKey;
    vad: { valence: number; arousal: number };
    turns: SerTurnResult[];
  };
  conditionLevel: ConditionLevel | string;
  moodStatus: string | null;
  browserProsody?: VoiceProsodySessionSummary | null;
}): VoiceSerSessionSummary {
  const method =
    input.raw.method === "emotion2vec_plus_kesdy_v1"
      ? "emotion2vec_plus_kesdy_v1"
      : "emotion2vec_plus_v1";

  const fused = fuseEmotionSignals({
    conditionLevel: input.conditionLevel,
    moodStatus: input.moodStatus,
    serAppEmotionKey: input.raw.app_emotion_key,
    serConfidence: input.raw.confidence,
    browserProsodyHint: input.browserProsody?.prosodyEmotionHint ?? null,
  });

  return {
    method,
    model_id: input.raw.model_id,
    turn_count: input.raw.turn_count,
    label: input.raw.label as VoiceSerSessionSummary["label"],
    confidence: input.raw.confidence,
    label_scores: input.raw.label_scores,
    app_emotion_key: input.raw.app_emotion_key,
    vad: input.raw.vad,
    turns: input.raw.turns,
    fused_emotion_key: fused.emotionKey,
    fusion_source: fused.source,
  };
}

/** SER API 미설정 시 브라우저 prosody만으로 bundle 생성 */
export function buildVoiceAnalysisBundle(input: {
  conditionLevel: ConditionLevel | string;
  moodStatus: string | null;
  ser?: VoiceSerSessionSummary | null;
  browserProsody?: VoiceProsodySessionSummary | null;
}) {
  const fused = fuseEmotionSignals({
    conditionLevel: input.conditionLevel,
    moodStatus: input.moodStatus,
    serAppEmotionKey: input.ser?.app_emotion_key ?? null,
    serConfidence: input.ser?.confidence ?? 0,
    browserProsodyHint: input.browserProsody?.prosodyEmotionHint ?? null,
  });

  return {
    ser: input.ser ?? null,
    browserProsody: input.browserProsody ?? null,
    fusedEmotionKey: fused.emotionKey,
    fusionSource: fused.source,
  };
}

export function normalizeSerTurnResult(raw: Record<string, unknown>): SerTurnResult {
  const label = String(raw.label ?? "unknown").toLowerCase();
  return {
    label: label as SerTurnResult["label"],
    confidence: Number(raw.confidence ?? 0),
    label_scores: (raw.label_scores as SerTurnResult["label_scores"]) ?? {},
    app_emotion_key: (raw.app_emotion_key as EmotionKey) ?? mapEmotion2VecLabel(label),
    vad: (raw.vad as SerTurnResult["vad"]) ?? { valence: 0, arousal: 0 },
    model_id: raw.model_id as string | undefined,
    step_id: (raw.step_id as string | null) ?? null,
    transcript: (raw.transcript as string) ?? "",
  };
}

export function clipsPayloadFromClient(clips: VoiceSerTurnClip[]) {
  return clips.map((c) => ({
    step_id: c.stepId ?? null,
    transcript: c.transcript,
    audio_base64: c.audioBase64,
    mime_type: c.mimeType || "audio/webm",
  }));
}
