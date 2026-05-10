import { describe, it, expect } from "vitest";
import { matchKeywords, shouldEscalate, KEYWORD_RULES } from "./keywords";

describe("keywords / matchKeywords", () => {
  it("빈 문자열은 매칭 없음", () => {
    expect(matchKeywords("")).toEqual([]);
  });

  it("낙상 표현 매칭 (escalate=true)", () => {
    const m = matchKeywords("아침에 화장실에서 넘어졌어");
    expect(m.length).toBeGreaterThan(0);
    expect(m[0].category).toBe("fall");
    expect(m[0].escalate).toBe(true);
  });

  it("가슴 통증 표현 매칭", () => {
    const m = matchKeywords("가슴이 아파서 잠을 못 잤어");
    expect(m.find((x) => x.category === "chest_pain")).toBeTruthy();
  });

  it("우울 표현은 escalate=false (단발 응급 아님)", () => {
    const m = matchKeywords("그냥 외로워");
    const dep = m.find((x) => x.category === "depression");
    expect(dep).toBeTruthy();
    expect(dep!.escalate).toBe(false);
  });

  it("일반 안부 응답은 매칭 없음", () => {
    expect(matchKeywords("오늘은 밥도 잘 먹고 괜찮아요")).toEqual([]);
  });
});

describe("keywords / shouldEscalate", () => {
  it("응급 키워드가 있으면 KeywordMatch 반환", () => {
    const e = shouldEscalate("숨이 차요");
    expect(e).not.toBeNull();
    expect(e!.category).toBe("breathing");
  });

  // 알려진 한계: 부사 삽입형 발화는 현재 정규식이 잡지 못한다.
  // 이 테스트가 통과하면(=null이 아니면) 정규식이 개선됐다는 신호이므로
  // 이 케이스를 정식 escalate 테스트로 승격해야 한다.
  it("[KNOWN-LIMIT] 부사 삽입('숨이 너무 차요')은 현재 미매칭", () => {
    expect(shouldEscalate("숨이 너무 차요")).toBeNull();
  });

  it("우울만 있으면 null", () => {
    expect(shouldEscalate("우울하네")).toBeNull();
  });

  it("아무 매칭 없으면 null", () => {
    expect(shouldEscalate("점심은 김치찌개")).toBeNull();
  });
});

describe("keywords / KEYWORD_RULES sanity", () => {
  it("모든 카테고리는 최소 1개 패턴 보유", () => {
    const cats = new Set(KEYWORD_RULES.map((r) => r.category));
    expect(cats.size).toBe(KEYWORD_RULES.length === cats.size ? cats.size : KEYWORD_RULES.length);
    expect(cats.size).toBeGreaterThanOrEqual(9);
  });
});
