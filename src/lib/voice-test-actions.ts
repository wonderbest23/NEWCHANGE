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
    const realtimeModel = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-1.5";
    const sessionConfig = {
      session: {
        type: "realtime",
        model: realtimeModel,
        output_modalities: ["audio"],
        instructions,
        audio: {
          input: {
            transcription: { model: "whisper-1", language: "ko" },
            turn_detection: {
              type: "server_vad",
              threshold: 0.68,
              prefix_padding_ms: 350,
              silence_duration_ms: 900,
              create_response: false,
              interrupt_response: false,
            },
            noise_reduction: { type: "near_field" },
          },
          output: {
            voice: DEFAULT_KOREAN_VOICE,
          },
        },
      },
    };

    const response = await fetch(`${OPENAI_BASE_URL}/realtime/client_secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionConfig),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI realtime session error:", response.status, errText);
      const detail = errText ? `: ${errText.slice(0, 500)}` : "";
      throw new Error(`Failed to create realtime session: ${response.status}${detail}`);
    }

    const session = await response.json();
    const clientSecret = session.value ?? session.client_secret?.value;
    return {
      client_secret: clientSecret as string,
      expires_at: (session.expires_at ?? session.client_secret?.expires_at) as number,
      model: (session.session?.model ?? realtimeModel) as string,
    };
  });
