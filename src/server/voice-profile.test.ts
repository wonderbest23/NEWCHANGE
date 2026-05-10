import { describe, expect, it } from "vitest";
import {
  DEFAULT_KOREAN_VOICE,
  KOREAN_ANNOUNCER_RULES,
  SENIOR_CHECKIN_FLOW,
  SENIOR_CHECKIN_ROLE,
  buildKoreanInstructions,
} from "./voice-profile";

describe("KOREAN_ANNOUNCER_RULES — 발음·억양 가드레일", () => {
  it("표준 한국어(서울말) 강제 규칙이 포함된다", () => {
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/표준 한국어/);
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/서울말/);
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/한국어 원어민/);
  });

  it("아나운서급 발음 명시가 있다", () => {
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/아나운서/);
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/또박또박/);
  });

  it("외래어를 한국식으로 읽는 예시가 모두 포함된다", () => {
    const examples: Array<[string, string]> = [
      ["AI", "에이아이"],
      ["care", "케어"],
      ["app", "앱"],
      ["OK", "오케이"],
      ["Wi-Fi", "와이파이"],
      ["SMS", "에스엠에스"],
    ];
    for (const [src, ko] of examples) {
      expect(KOREAN_ANNOUNCER_RULES).toContain(src);
      expect(KOREAN_ANNOUNCER_RULES).toContain(ko);
    }
  });

  it("숫자를 한국식으로 읽는 규칙이 포함된다", () => {
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/일곱 시/);
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/세 번/);
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/이천이십육년/);
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/전화번호/);
  });

  it("단위는 한국식 발음 규칙이 포함된다", () => {
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/킬로그램/);
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/밀리리터/);
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/퍼센트/);
  });

  it("시니어 응대 톤 가이드가 포함된다", () => {
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/존댓말/);
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/따뜻/);
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/1~2문장/);
  });

  it("외국어 억양 금지 규칙이 명시된다", () => {
    expect(KOREAN_ANNOUNCER_RULES).toMatch(/사투리|외국어 억양/);
  });
});

describe("buildKoreanInstructions() — 시나리오 합성", () => {
  it("발음 규칙이 항상 가장 앞에 위치한다", () => {
    const out = buildKoreanInstructions({
      role: SENIOR_CHECKIN_ROLE,
      flow: SENIOR_CHECKIN_FLOW,
      personaName: "김순자",
    });
    expect(out.indexOf(KOREAN_ANNOUNCER_RULES)).toBe(0);
  });

  it("personaName 토큰이 실제 이름으로 치환된다", () => {
    const out = buildKoreanInstructions({
      role: SENIOR_CHECKIN_ROLE,
      flow: SENIOR_CHECKIN_FLOW,
      personaName: "김순자",
    });
    expect(out).toContain("김순자");
    expect(out).not.toContain("${personaName}");
  });

  it("personaName 누락 시 '어르신'으로 폴백된다", () => {
    const out = buildKoreanInstructions({
      role: SENIOR_CHECKIN_ROLE,
      flow: SENIOR_CHECKIN_FLOW,
    });
    expect(out).toContain("어르신");
    expect(out).not.toContain("${personaName}");
  });

  it("personaContext가 있으면 [참고 정보] 섹션이 포함된다", () => {
    const out = buildKoreanInstructions({
      role: SENIOR_CHECKIN_ROLE,
      flow: SENIOR_CHECKIN_FLOW,
      personaName: "김순자",
      personaContext: "고혈압 약 매일 아침 1회 복용",
    });
    expect(out).toMatch(/\[참고 정보\]/);
    expect(out).toContain("고혈압 약 매일 아침 1회 복용");
  });

  it("personaContext가 없으면 [참고 정보] 섹션이 생기지 않는다", () => {
    const out = buildKoreanInstructions({
      role: SENIOR_CHECKIN_ROLE,
      flow: SENIOR_CHECKIN_FLOW,
      personaName: "김순자",
    });
    expect(out).not.toMatch(/\[참고 정보\]/);
  });

  it("[역할]과 [대화 흐름] 섹션이 모두 포함된다", () => {
    const out = buildKoreanInstructions({
      role: SENIOR_CHECKIN_ROLE,
      flow: SENIOR_CHECKIN_FLOW,
      personaName: "김순자",
    });
    expect(out).toMatch(/\[역할\]/);
    expect(out).toMatch(/\[대화 흐름\]/);
  });

  it("시니어 안부 4대 질문이 모두 흐름에 포함된다", () => {
    expect(SENIOR_CHECKIN_FLOW).toMatch(/식사/);
    expect(SENIOR_CHECKIN_FLOW).toMatch(/잠/);
    expect(SENIOR_CHECKIN_FLOW).toMatch(/약/);
    expect(SENIOR_CHECKIN_FLOW).toMatch(/기분|컨디션/);
  });

  it("공백/whitespace로만 채워진 personaName도 폴백된다", () => {
    const out = buildKoreanInstructions({
      role: SENIOR_CHECKIN_ROLE,
      flow: SENIOR_CHECKIN_FLOW,
      personaName: "   ",
    });
    expect(out).toContain("어르신");
  });
});

describe("DEFAULT_KOREAN_VOICE — 한국어 적합 음성", () => {
  it("한국어 운율에 잘 맞는 음성 중 하나여야 한다", () => {
    expect(["marin", "cedar", "sage"]).toContain(DEFAULT_KOREAN_VOICE);
  });
});
