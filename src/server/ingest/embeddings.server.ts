// Lovable AI 임베딩 (의미 기반 검색용). 1536차원 호환 모델 사용.
// 주의: Lovable AI Gateway는 텍스트 임베딩 일부 모델만 제공합니다. 가용성 미보장 시 null 반환.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/embeddings";

export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: text.slice(0, 8000),
      }),
    });
    if (!res.ok) {
      console.warn("[embed] gateway", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return json.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.warn("[embed] failed", e);
    return null;
  }
}
