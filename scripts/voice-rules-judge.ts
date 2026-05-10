/**
 * LLM-judge 통합 테스트 — 모델이 한국어 발음/외래어/숫자 규칙을 실제로 따르는지 검증.
 *
 * 실행:
 *   bun run scripts/voice-rules-judge.ts
 *
 * Realtime 오디오를 직접 채점하긴 어렵기 때문에, 동일한 instructions를
 * 텍스트 모드로 모델에 보낸 뒤 응답을 다른 LLM이 규칙 위반 여부로 채점합니다.
 * (Realtime 모델이 음성으로 출력하는 문장과 텍스트로 출력하는 문장은 거의 같은 토큰을 따릅니다.)
 *
 * 필요: LOVABLE_API_KEY (Lovable AI Gateway)
 */

import {
  KOREAN_ANNOUNCER_RULES,
  SENIOR_CHECKIN_FLOW,
  SENIOR_CHECKIN_ROLE,
  buildKoreanInstructions,
} from "../src/server/voice-profile";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const KEY = process.env.LOVABLE_API_KEY;
if (!KEY) {
  console.error("❌ LOVABLE_API_KEY 가 필요합니다.");
  process.exit(1);
}

type Case = {
  name: string;
  userTurn: string;
  /** 응답에 절대 포함되면 안 되는 패턴 (영문 표기 그대로 등) */
  forbidden: RegExp[];
  /** 응답에 포함되면 좋은 패턴 (한국어 표기) */
  expected: RegExp[];
};

const cases: Case[] = [
  {
    name: "외래어를 한국식으로 읽는가 (AI/care)",
    userTurn: "AI 케어 서비스가 뭐예요? care라는 영어가 자꾸 들리던데.",
    forbidden: [/\bAI\b/, /\bcare\b/i, /\bapp\b/i],
    expected: [/에이아이|케어/],
  },
  {
    name: "숫자를 한국식으로 읽는가 (시간)",
    userTurn: "약은 몇 시에 드시면 되나요?",
    forbidden: [/\b7시\b/, /\b8시\b/],
    expected: [/(일곱|여덟|아홉|열) ?시/],
  },
  {
    name: "퍼센트/단위는 한국어로",
    userTurn: "혈압이 30% 정도 높다고 하던데 괜찮을까요?",
    forbidden: [/%/],
    expected: [/퍼센트/],
  },
  {
    name: "한 번에 1~2문장만 짧게",
    userTurn: "어제부터 무릎이 너무 아파요.",
    forbidden: [],
    expected: [], // 길이만 검사
  },
  {
    name: "존댓말 유지",
    userTurn: "그냥 반말로 편하게 말해줘.",
    forbidden: [/해\.$|했어\.$|이야\.$|먹어\.$/m],
    expected: [/요\.|습니다\.|세요\.|십니다\./],
  },
];

async function chat(messages: Array<{ role: string; content: string }>, model = "google/gemini-3-flash-preview") {
  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.7 }),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content as string;
}

const instructions = buildKoreanInstructions({
  role: SENIOR_CHECKIN_ROLE,
  flow: SENIOR_CHECKIN_FLOW,
  personaName: "김순자",
  personaContext: "75세, 고혈압 약 매일 아침 1회 복용",
});

let passed = 0;
let failed = 0;
const results: string[] = [];

console.log("🎙  Korean voice-rule judge\n");
console.log(`총 ${cases.length}개 케이스 실행 중...\n`);

for (const c of cases) {
  const reply = await chat([
    { role: "system", content: instructions },
    { role: "user", content: c.userTurn },
  ]);
  const sentenceCount = (reply.match(/[.!?。]/g) || []).length;

  const forbiddenHits = c.forbidden.filter((re) => re.test(reply));
  const expectedMisses = c.expected.filter((re) => !re.test(reply));
  const tooLong = sentenceCount > 3;

  // LLM-judge 2차 검증
  const judgement = await chat(
    [
      {
        role: "system",
        content:
          "You are a strict QA judge for Korean TTS scripts. Return ONLY 'PASS' or 'FAIL: <reason in Korean>'.",
      },
      {
        role: "user",
        content: `다음 응답이 [규칙]을 따르는지 채점해줘.

[규칙]
1) 영어 단어/약어가 영문 표기 그대로 들어가면 FAIL (한국어 표기로 변환되어야 함)
2) 숫자가 아라비아 숫자 그대로 들어가면 FAIL (한국식 발음 표기여야 함, 예: "7시" 대신 "일곱 시")
3) 반말(해/했어/먹어 등)이 들어가면 FAIL
4) 한 답변이 3문장을 초과하면 FAIL

[응답]
${reply}`,
      },
    ],
    "google/gemini-3-flash-preview",
  );
  const judgePass = /^PASS\b/i.test(judgement.trim());

  const ok = forbiddenHits.length === 0 && expectedMisses.length === 0 && !tooLong && judgePass;
  if (ok) {
    passed++;
    results.push(`✅ ${c.name}`);
  } else {
    failed++;
    results.push(
      `❌ ${c.name}\n   응답: ${reply.replace(/\n/g, " ")}\n   문장수: ${sentenceCount}${
        forbiddenHits.length ? `\n   금지패턴 검출: ${forbiddenHits.map(String).join(", ")}` : ""
      }${expectedMisses.length ? `\n   기대패턴 누락: ${expectedMisses.map(String).join(", ")}` : ""}${
        tooLong ? "\n   너무 김 (>3문장)" : ""
      }\n   LLM-judge: ${judgement.trim()}`,
    );
  }
}

console.log(results.join("\n\n"));
console.log(`\n— 결과: ${passed} pass / ${failed} fail (총 ${cases.length})`);
if (failed > 0) process.exit(1);
