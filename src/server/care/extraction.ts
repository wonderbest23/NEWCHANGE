/**
 * Extraction Pipeline
 *
 * 통화 종료 후 호출. 역할:
 *  1. call_turns 조회 (해당 session 의 user 발화 + classified_value)
 *  2. axis 별 1개 결과로 정규화 (마지막 값 우선)
 *  3. extracted_check_results upsert
 *  4. 키워드 매칭 결과 symptoms_log insert
 *
 * MVP: DB 어댑터 인터페이스만 정의. 실제 query 는 Cursor 인계 후 채움.
 */

import type {
  CallTurn,
  CheckAxis,
  ClassifiedValue,
  ExtractedCheckResult,
} from "../care/types";
import { matchKeywords, type KeywordMatch } from "../care/keywords";

export interface ExtractionFetchers {
  getTurns(sessionId: string): Promise<CallTurn[]>;
  getSessionMeta(sessionId: string): Promise<{ care_recipient_id: string; recorded_for_date: string }>;
}

export interface ExtractionWriters {
  upsertExtracted(
    rows: Omit<ExtractedCheckResult, "id">[],
  ): Promise<void>;
  insertSymptoms(rows: {
    care_recipient_id: string;
    session_id: string;
    category: string;
    severity?: "mild" | "moderate" | "severe";
    keywords: string[];
    occurred_on: string;
  }[]): Promise<void>;
}

export interface ExtractionResult {
  extracted: Omit<ExtractedCheckResult, "id">[];
  keywordMatches: KeywordMatch[];
}

export async function extractFromSession(
  sessionId: string,
  fetchers: ExtractionFetchers,
  writers: ExtractionWriters,
): Promise<ExtractionResult> {
  const [turns, meta] = await Promise.all([
    fetchers.getTurns(sessionId),
    fetchers.getSessionMeta(sessionId),
  ]);

  // axis 별 마지막 classified_value 채택
  const byAxis = new Map<CheckAxis, ClassifiedValue>();
  const allKeywords: KeywordMatch[] = [];

  for (const t of turns) {
    if (t.role !== "user") continue;
    if (t.classified_value) {
      byAxis.set(t.classified_value.axis, t.classified_value);
    }
    if (t.raw_text) {
      allKeywords.push(...matchKeywords(t.raw_text));
    }
  }

  const extracted: Omit<ExtractedCheckResult, "id">[] = [...byAxis.entries()].map(([axis, value]) => ({
    session_id: sessionId,
    care_recipient_id: meta.care_recipient_id,
    recorded_for_date: meta.recorded_for_date,
    axis,
    value,
  }));

  await writers.upsertExtracted(extracted);

  if (allKeywords.length > 0) {
    await writers.insertSymptoms(
      allKeywords.map((k) => ({
        care_recipient_id: meta.care_recipient_id,
        session_id: sessionId,
        category: k.category,
        keywords: [k.matched],
        occurred_on: meta.recorded_for_date,
      })),
    );
  }

  return { extracted, keywordMatches: allKeywords };
}
