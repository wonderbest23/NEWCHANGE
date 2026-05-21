import { describe, it, expect, vi, beforeEach } from "vitest";

// supabaseAdmin 모킹 — 체인형 빌더 + auth.getUser 둘 다 흉내
const rows = [
  {
    content: "최근 무릎 통증이나 불편을 말씀하신 기록이 있어요.",
    confidence: 0.82,
    observation_count: 2,
    last_observed_at: "2026-05-08T10:00:00+09:00",
  },
  {
    content: "최근 약 복용을 한 번 더 확인해야 한다고 말씀하신 기록이 있어요.",
    confidence: 0.75,
    observation_count: 1,
    last_observed_at: "2026-05-07T09:30:00+09:00",
  },
  {
    content: "최근 식사를 거르거나 입맛이 부족하다고 말씀하신 기록이 있어요.",
    confidence: 0.7,
    observation_count: 1,
    last_observed_at: "2026-05-06T10:10:00+09:00",
  },
];

const limitMock = vi.fn().mockResolvedValue({ data: rows, error: null });

vi.mock("@/integrations/supabase/client.server", () => {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: (n: number) => limitMock(n),
  };
  return {
    supabaseAdmin: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "senior-uuid-1" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue(builder),
    },
  };
});

import { buildAiMemoryContext } from "./voice-test.memory.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

describe("PR1 — AI 기억 루프", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockResolvedValue({ data: rows, error: null });
  });

  it("토큰이 없으면 빈 문자열을 반환한다", async () => {
    const out = await buildAiMemoryContext(null);
    expect(out).toBe("");
  });

  it("근거 기반 기억을 system prompt 섹션으로 포맷한다", async () => {
    const out = await buildAiMemoryContext("fake-jwt");
    expect(out).toContain("[지난 대화 기억");
    expect(out).toContain("무릎 통증");
    expect(out).toContain("약 복용");
    expect(out).toContain("식사를 거르거나");
    // 활용 규칙도 포함되어야 한다
    expect(out).toContain("활용 규칙");
  });

  it("오늘(KST) 자정 이전 데이터만 가져오도록 lt 필터를 건다", async () => {
    await buildAiMemoryContext("fake-jwt");
    const builder: any = (supabaseAdmin.from as any).mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith("user_id", "senior-uuid-1");
    expect(builder.is).toHaveBeenCalledWith("denied_at", null);
    expect(builder.lt).toHaveBeenCalledWith("last_observed_at", expect.any(String));
    expect(builder.gte).toHaveBeenCalledWith("confidence", 0.6);
    expect(builder.order).toHaveBeenCalledWith("last_observed_at", { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(3);
  });

  it("결과가 비어 있으면 빈 문자열을 반환한다", async () => {
    limitMock.mockResolvedValueOnce({ data: [], error: null });
    const out = await buildAiMemoryContext("fake-jwt");
    expect(out).toBe("");
  });

  it("DB 에러 시 빈 문자열을 반환한다 (조용히 실패)", async () => {
    limitMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const out = await buildAiMemoryContext("fake-jwt");
    expect(out).toBe("");
  });
});
