// OpenAI 임베딩 (의미 기반 검색용). text-embedding-3-small (1536차원).
// 키 미설정 또는 호출 실패 시 null 반환.

const OPENAI_URL = "https://api.openai.com/v1/embeddings";

export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.slice(0, 8000),
      }),
    });
    if (!res.ok) {
      console.warn("[embed] openai", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return json.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.warn("[embed] failed", e);
    return null;
  }
}
