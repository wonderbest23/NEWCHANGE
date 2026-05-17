import { createServerFn } from "@tanstack/react-start";

/**
 * OpenAI TTS — 시니어용 따뜻한 한국어 음성.
 * 브라우저 SpeechSynthesis 대신 사용해 어색한 합성 음성 문제를 해결.
 * 반환: base64 mp3 (클라이언트에서 data URI로 바로 재생).
 */
export const synthesizeAnswerSpeech = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string }) => {
    const text = (d?.text ?? "").toString().slice(0, 4000);
    if (!text.trim()) throw new Error("text is required");
    return { text };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

    const { OPENAI_BASE_URL } = await import("@/lib/ai/openai-base");
    const res = await fetch(`${OPENAI_BASE_URL}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(process.env.OPENAI_PROJECT_ID
          ? { "OpenAI-Project": process.env.OPENAI_PROJECT_ID }
          : {}),
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "marin",
        input: data.text,
        response_format: "mp3",
        instructions:
          "한국 표준어(서울말)로 또박또박, 60~80세 어르신께 말하듯 따뜻하고 부드럽게, 평소보다 약 10% 천천히 읽어 주세요. 존댓말로, 문장 끝을 분명히 발음하세요.",
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[tts] openai speech failed", res.status, t);
      throw new Error(`tts failed: ${res.status}`);
    }

    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { audio: base64, mime: "audio/mpeg" };
  });
