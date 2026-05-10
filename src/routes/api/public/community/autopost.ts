import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CATEGORIES = [
  { slug: "free", weight: 55, label: "자유게시판",
    topics: ["오늘 점심 메뉴", "동네 산책길 추천", "손주 자랑", "텃밭 근황", "옛날 이야기", "라디오에서 들은 노래", "비 오는 날 단상", "병원 다녀온 일상", "시장 다녀온 후기", "동창 모임 후기"] },
  { slug: "welfare", weight: 18, label: "복지혜택",
    topics: ["기초연금 신청 후기", "노인장기요양보험 등급 받은 후기", "치매안심센터 이용기", "보청기 지원 받는 법 문의", "경로당 식사 지원", "교통비 지원 신청"] },
  { slug: "news", weight: 12, label: "새로운소식",
    topics: ["우리 동네 새로 생긴 식당", "경로당 행사 일정", "지하철 역 무료 셔틀", "구청 건강검진 안내", "복지관 프로그램 변경"] },
  { slug: "agency", weight: 10, label: "대행업체",
    topics: ["이사 도와줄 업체 추천", "도배 깔끔하게 잘하는 곳", "에어컨 청소 후기", "안방 장롱 옮겨준 곳", "정수기 점검 받은 후기"] },
  { slug: "jobs", weight: 5, label: "구인구직",
    topics: ["아파트 경비 자리 구합니다", "주말 시니어 일자리 후기", "도서관 봉사 모집"] },
];

function pickWeighted<T extends { weight: number }>(arr: T[]): T {
  const total = arr.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of arr) { r -= x.weight; if (r <= 0) return x; }
  return arr[arr.length - 1];
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 시간대별 활동 가중치 (KST 기준 hour → multiplier 0~1.5)
function timeOfDayWeight(): number {
  const now = new Date();
  const kstHour = (now.getUTCHours() + 9) % 24;
  if (kstHour >= 6 && kstHour < 10) return 1.5;   // 새벽~아침
  if (kstHour >= 13 && kstHour < 17) return 1.3;  // 오후
  if (kstHour >= 19 && kstHour < 23) return 1.4;  // 저녁
  if (kstHour >= 0 && kstHour < 5) return 0.1;    // 새벽 거의 없음
  return 0.7;
}

export const Route = createFileRoute("/api/public/community/autopost")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        // 시간대 가중치로 이번 호출에서 1~3개 글 생성
        const weight = timeOfDayWeight();
        const baseCount = Math.random() < weight ? 1 : 0;
        const bonus = Math.random() < weight - 0.5 ? 1 : 0;
        const count = Math.max(0, baseCount + bonus);
        if (count === 0) {
          return Response.json({ skipped: true, reason: "low_activity_window" });
        }

        // 봇 작성자 풀 로드 (지역 정보 포함)
        const { data: bots } = await supabaseAdmin
          .from("community_bot_authors")
          .select("id, nickname, region_sido, region_sigungu");
        if (!bots || bots.length === 0) {
          return new Response("No bot authors", { status: 500 });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const created: string[] = [];

        for (let i = 0; i < count; i++) {
          const cat = pickWeighted(CATEGORIES);
          const topic = pick(cat.topics);
          const author = pick(bots);
          const model = Math.random() < 0.7 ? "google/gemini-2.5-flash" : "google/gemini-2.5-flash-lite";

          const systemPrompt = `당신은 한국의 60~75세 시니어 사용자가 직접 모바일 화면에서 손가락으로 친 듯한 짧은 커뮤니티 글을 작성합니다.
규칙:
- 절대 AI 같지 않게. 너무 매끄럽지 않게. 줄바꿈 자유롭게.
- 가끔 띄어쓰기/맞춤법이 살짝 어긋나도 괜찮음 (한두 군데만, 자연스럽게).
- 이모지는 거의 안 씀. 쓰더라도 한 개 이내.
- 본인 일상/감정/경험 위주. 단정짓지 말 것.
- 글쓴이 닉네임은 "${author.nickname}". 카테고리는 "${cat.label}".
- 출력은 반드시 JSON: {"title": "20자 이내", "body": "3~6문장, 줄바꿈 포함, 200자~450자"}
- title에 따옴표나 마침표 금지. body 마지막에 인사말 없이 끝내도 됨.`;

          const userPrompt = `주제 힌트: "${topic}"\n위 주제로 짧은 게시글을 JSON으로 작성해줘.`;

          try {
            const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userPrompt },
                ],
                response_format: { type: "json_object" },
              }),
            });

            if (!aiResp.ok) {
              console.error("AI gen failed", aiResp.status, await aiResp.text());
              continue;
            }
            const aiData = await aiResp.json();
            const text: string = aiData?.choices?.[0]?.message?.content ?? "";
            let parsed: { title?: string; body?: string };
            try { parsed = JSON.parse(text); } catch { continue; }
            if (!parsed.title || !parsed.body) continue;

            // created_at을 1~45분 전 랜덤으로 살짝 과거화
            const offsetMin = Math.floor(Math.random() * 45) + 1;
            const createdAt = new Date(Date.now() - offsetMin * 60_000).toISOString();

            const { data: ins, error } = await supabaseAdmin
              .from("community_posts")
              .insert({
                category_slug: cat.slug,
                title: parsed.title.slice(0, 80),
                body: parsed.body.slice(0, 4000),
                author_id: author.id,
                ai_generated: true,
                views: Math.floor(Math.random() * 8) + 1,
                created_at: createdAt,
                region_sido: author.region_sido ?? null,
                region_sigungu: author.region_sigungu ?? null,
              })
              .select("id")
              .single();
            if (error) {
              console.error("insert post failed", error);
              continue;
            }
            created.push(ins.id);
          } catch (e) {
            console.error("autopost iter error", e);
          }
        }

        return Response.json({ created: created.length, ids: created });
      },
    },
  },
});
