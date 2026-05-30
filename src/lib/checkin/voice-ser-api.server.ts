/**
 * SER API 클라이언트 (서버 전용).
 *
 * SER_API_URL — local uvicorn 또는 Modal 엔드포인트
 * SER_API_KEY  — Bearer (선택)
 */

import type { EmotionKey } from "./emotion";
import {
  buildVoiceSerSessionSummary,
  clipsPayloadFromClient,
  normalizeSerTurnResult,
} from "./voice-ser-fusion";
import type { VoiceProsodySessionSummary } from "./voice-prosody";
import type { VoiceSerSessionSummary, VoiceSerTurnClip } from "./voice-ser.types";

const MAX_CLIP_BYTES = 3 * 1024 * 1024;
const MAX_TURNS = 12;

function serApiUrl(): string | null {
  const url = process.env.SER_API_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

export function isSerApiConfigured(): boolean {
  return Boolean(serApiUrl());
}

async function postSer<T>(path: string, body: unknown): Promise<T> {
  const base = serApiUrl();
  if (!base) throw new Error("SER_API_URL not configured");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = process.env.SER_API_KEY?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.SER_API_TIMEOUT_MS ?? 45_000)),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SER API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

export async function analyzeVoiceSerSession(input: {
  clips: VoiceSerTurnClip[];
  conditionLevel: string;
  moodStatus: string | null;
  browserProsody?: VoiceProsodySessionSummary | null;
}): Promise<VoiceSerSessionSummary | null> {
  if (!isSerApiConfigured()) return null;

  const turns = input.clips
    .filter((c) => c.audioBase64 && c.audioBase64.length > 0)
    .slice(0, MAX_TURNS)
    .filter((c) => {
      try {
        const bytes = Buffer.from(c.audioBase64, "base64").length;
        return bytes > 200 && bytes <= MAX_CLIP_BYTES;
      } catch {
        return false;
      }
    });

  if (turns.length === 0) return null;

  type RawSession = {
    method?: string;
    model_id: string;
    turn_count: number;
    label: string;
    confidence: number;
    label_scores: Record<string, number>;
    app_emotion_key: EmotionKey;
    vad: { valence: number; arousal: number };
    turns: Record<string, unknown>[];
  };

  const raw = await postSer<RawSession>("/v1/analyze-session", {
    turns: clipsPayloadFromClient(turns),
  });

  return buildVoiceSerSessionSummary({
    raw: {
      method: raw.method,
      model_id: raw.model_id,
      turn_count: raw.turn_count,
      label: raw.label,
      confidence: raw.confidence,
      label_scores: raw.label_scores,
      app_emotion_key: raw.app_emotion_key,
      vad: raw.vad,
      turns: (raw.turns ?? []).map(normalizeSerTurnResult),
    },
    conditionLevel: input.conditionLevel,
    moodStatus: input.moodStatus,
    browserProsody: input.browserProsody,
  });
}

export async function checkSerHealth(): Promise<{ ok: boolean; model?: string }> {
  const base = serApiUrl();
  if (!base) return { ok: false };
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { model?: string };
    return { ok: true, model: json.model };
  } catch {
    return { ok: false };
  }
}
