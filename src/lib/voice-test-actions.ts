import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import {
  DEFAULT_KOREAN_VOICE,
  SENIOR_CHECKIN_FLOW,
  SENIOR_CHECKIN_ROLE,
  buildKoreanInstructions,
} from "./voice-profile";
import { buildAiMemoryContext } from "./voice-test.memory.server";

/**
 * Realtime API용 ephemeral 토큰 발급.
 * 클라이언트가 OpenAI에 직접 WebRTC 연결할 때 사용.
 * 일반 API 키는 절대 클라이언트에 노출하지 않음.
 */
export const createRealtimeSession = createServerFn({ method: "POST" })
  .inputValidator((d: { personaName?: string; personaContext?: string }) => d)
  .handler(async ({ data }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

    // PR1: 로그인된 시니어라면 최근 3일 안부 요약을 system prompt 에 주입
    const authHeader = getRequestHeader("authorization") ?? getRequestHeader("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const memory = await buildAiMemoryContext(token);
    console.log("[voice-test] PR1 memory injection", {
      hasToken: !!token,
      memoryChars: memory.length,
      memoryPreview: memory ? memory.slice(0, 200) : "(none)",
    });

    const mergedContext = [memory, data.personaContext?.trim()].filter(Boolean).join("\n\n");

    const instructions = buildKoreanInstructions({
      role: SENIOR_CHECKIN_ROLE,
      flow: SENIOR_CHECKIN_FLOW,
      personaName: data.personaName,
      personaContext: mergedContext || undefined,
    });

    const { OPENAI_BASE_URL } = await import("@/lib/ai/openai-base");
    const response = await fetch(`${OPENAI_BASE_URL}/realtime/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-realtime-1.5",
        voice: DEFAULT_KOREAN_VOICE,
        modalities: ["audio", "text"],
        instructions,
        temperature: 0.7,
        input_audio_transcription: { model: "whisper-1", language: "ko" },
        // 시니어 환경(보청기, TV, 가족 목소리) 보정:
        // - threshold 높여 잡음 오인식 감소
        // - silence_duration 길게 — 어르신은 말 중간에 쉼이 길다
        // - interrupt_response: false — AI 음성이 다시 마이크로 들어가 반복 응답되는 것 차단
        turn_detection: {
          type: "server_vad",
          threshold: 0.55,
          prefix_padding_ms: 250,
          silence_duration_ms: 550,
          create_response: true,
          interrupt_response: true,
        },
        // 휴대폰을 가까이 들고 통화 → near_field
        input_audio_noise_reduction: { type: "near_field" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI realtime session error:", response.status, errText);
      throw new Error(`Failed to create realtime session: ${response.status}`);
    }

    const session = await response.json();
    return {
      client_secret: session.client_secret?.value as string,
      expires_at: session.client_secret?.expires_at as number,
      model: session.model as string,
    };
  });
