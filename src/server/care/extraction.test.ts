import { describe, it, expect, vi } from "vitest";
import { extractFromSession, type ExtractionFetchers, type ExtractionWriters } from "./extraction";
import type { CallTurn, ExtractedCheckResult } from "./types";

const SID = "11111111-1111-1111-1111-111111111111";
const RID = "22222222-2222-2222-2222-222222222222";
const DATE = "2026-04-30";

function turn(partial: Partial<CallTurn> & { turn_index: number }): CallTurn {
  return {
    id: crypto.randomUUID(),
    session_id: SID,
    role: "user",
    is_unclear: false,
    created_at: new Date().toISOString(),
    ...partial,
  };
}

function makeWriters(): ExtractionWriters & {
  extracted: Omit<ExtractedCheckResult, "id">[];
  symptoms: Parameters<ExtractionWriters["insertSymptoms"]>[0];
} {
  const extracted: Omit<ExtractedCheckResult, "id">[] = [];
  const symptoms: Parameters<ExtractionWriters["insertSymptoms"]>[0] = [];
  return {
    extracted,
    symptoms,
    upsertExtracted: vi.fn(async (rows) => {
      extracted.push(...rows);
    }),
    insertSymptoms: vi.fn(async (rows) => {
      symptoms.push(...rows);
    }),
  };
}

function makeFetchers(turns: CallTurn[]): ExtractionFetchers {
  return {
    getTurns: async () => turns,
    getSessionMeta: async () => ({ care_recipient_id: RID, recorded_for_date: DATE }),
  };
}

describe("extraction / extractFromSession", () => {
  it("axis 별 마지막 classified_value 만 채택", async () => {
    const turns = [
      turn({
        turn_index: 1,
        classified_value: { axis: "meal", value: "skipped" },
      }),
      turn({
        turn_index: 2,
        classified_value: { axis: "meal", value: "ate" }, // 더 최신
      }),
      turn({
        turn_index: 3,
        classified_value: { axis: "mood", value: "good" },
      }),
    ];
    const writers = makeWriters();
    const result = await extractFromSession(SID, makeFetchers(turns), writers);

    expect(result.extracted).toHaveLength(2);
    const meal = result.extracted.find((r) => r.axis === "meal")!;
    expect((meal.value as { value: string }).value).toBe("ate");
  });

  it("ai/system turn 은 무시, user 만 처리", async () => {
    const turns = [
      turn({ turn_index: 1, role: "ai", classified_value: { axis: "meal", value: "skipped" } }),
      turn({ turn_index: 2, role: "user", classified_value: { axis: "meal", value: "ate" } }),
    ];
    const writers = makeWriters();
    const result = await extractFromSession(SID, makeFetchers(turns), writers);
    expect(result.extracted).toHaveLength(1);
    expect((result.extracted[0].value as { value: string }).value).toBe("ate");
  });

  it("raw_text 의 응급 키워드는 symptoms_log 로 저장", async () => {
    const turns = [
      turn({ turn_index: 1, raw_text: "오늘 아침에 넘어졌어" }),
      turn({ turn_index: 2, raw_text: "가슴이 아프네" }),
      turn({ turn_index: 3, raw_text: "그냥 외로워" }),
    ];
    const writers = makeWriters();
    const result = await extractFromSession(SID, makeFetchers(turns), writers);

    const cats = result.keywordMatches.map((k) => k.category);
    expect(cats).toContain("fall");
    expect(cats).toContain("chest_pain");
    expect(cats).toContain("depression");

    expect(writers.insertSymptoms).toHaveBeenCalledTimes(1);
    expect(writers.symptoms.length).toBe(result.keywordMatches.length);
    expect(writers.symptoms[0]).toMatchObject({
      care_recipient_id: RID,
      session_id: SID,
      occurred_on: DATE,
    });
  });

  it("키워드 매칭 0건이면 insertSymptoms 호출 안 함", async () => {
    const turns = [turn({ turn_index: 1, raw_text: "오늘 김치찌개 먹었어" })];
    const writers = makeWriters();
    const result = await extractFromSession(SID, makeFetchers(turns), writers);
    expect(result.keywordMatches).toEqual([]);
    expect(writers.insertSymptoms).not.toHaveBeenCalled();
  });

  it("classified_value 없는 turn 만 있으면 extracted 비어있음", async () => {
    const turns = [turn({ turn_index: 1, raw_text: "음..." })];
    const writers = makeWriters();
    const result = await extractFromSession(SID, makeFetchers(turns), writers);
    expect(result.extracted).toEqual([]);
    expect(writers.upsertExtracted).toHaveBeenCalledWith([]);
  });
});
