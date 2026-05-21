// OpenAI 직접 호출 공용 엣지 함수.
// task: "polish" (글 다듬기) | "suggest_title" (제목 추천) | "answer" (법률/복지 1차 답변)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Task = "polish" | "suggest_title" | "answer";

const SYSTEM: Record<Task, string> = {
  polish: `당신은 한국 시니어 사용자가 쓴 커뮤니티 글을 다듬는 편집자입니다.
규칙:
- 원문의 의미와 정보는 절대 바꾸지 마세요. 새 사실을 추가하지 마세요.
- 맞춤법, 띄어쓰기, 문장부호를 정리하세요.
- 너무 거칠거나 공격적인 표현은 따뜻하고 정중하게 바꾸되, 글쓴이의 진심은 유지하세요.
- 문단을 자연스럽게 나누세요.
- 결과는 다듬어진 본문만 출력하세요. 설명/머리말/마크다운 헤더 없이.`,
  suggest_title: `당신은 한국 시니어 커뮤니티 글쓰기 도우미입니다.
규칙:
- 사용자가 적은 초안을 바탕으로 쉬운 한국어 제목 후보 3개를 만드세요.
- 각 제목은 18자 이내로 짧고 따뜻하게 쓰세요.
- 과장, 낚시성 표현, 새 사실 추가는 금지합니다.
- 번호, 따옴표, 설명 없이 제목만 줄바꿈으로 출력하세요.`,
  answer: `당신은 한국 시니어 커뮤니티의 친절한 1차 안내 도우미입니다.
규칙:
- 글의 카테고리(법률자문/복지혜택/구인구직 등)에 맞춰 일반적인 정보 차원의 답을 줍니다.
- 단정적인 법률 자문이 아니라 "일반적으로는 ~한 절차/제도가 있습니다" 식으로 안내하세요.
- 마지막에 "정확한 판단은 변호사·주민센터·구청 등 담당기관 확인을 권합니다." 같은 한 줄 안내를 붙이세요.
- 따뜻하고 쉬운 말로, 어려운 한자어는 풀어 쓰세요.
- 5~8문장 이내. 마크다운 헤더는 쓰지 마세요.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { task, title, body, category } = await req.json();
    if (!task) {
      return json({ error: "task는 필수입니다." }, 400);
    }
    if (task !== "polish" && task !== "answer" && task !== "suggest_title") {
      return json({ error: "지원하지 않는 task입니다." }, 400);
    }
    if (task !== "suggest_title" && (!body || typeof body !== "string")) {
      return json({ error: "body는 필수입니다." }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY 미설정" }, 500);

    const userMsg =
      task === "polish"
        ? `다음 시니어 회원이 쓴 글을 다듬어 주세요.\n\n[제목]\n${title ?? "(제목 없음)"}\n\n[본문]\n${body}`
        : task === "suggest_title"
        ? `카테고리: ${category ?? "일반"}\n\n[사용자가 적은 제목 초안]\n${title ?? ""}\n\n[본문 초안]\n${body ?? ""}\n\n위 내용을 보고 제목 후보 3개를 만들어 주세요.`
        : `카테고리: ${category ?? "일반"}\n\n[질문 제목]\n${title ?? "(제목 없음)"}\n\n[질문 본문]\n${body}\n\n위 질문에 대한 1차 안내를 작성해 주세요.`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM[task as Task] },
          { role: "user", content: userMsg },
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (resp.status === 429) {
      return json({ error: "요청이 잠시 많아요. 잠시 후 다시 시도해 주세요." }, 429);
    }
    if (resp.status === 402 || resp.status === 401) {
      return json({ error: "OpenAI API 키를 확인해 주세요." }, 402);
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("OpenAI error:", resp.status, t);
      return json({ error: "AI 응답 생성에 실패했어요." }, 500);
    }

    const data = await resp.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    return json({ text });
  } catch (e) {
    console.error("ai-assist error:", e);
    return json(
      { error: e instanceof Error ? e.message : "알 수 없는 오류" },
      500,
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
