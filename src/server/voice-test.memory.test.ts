import { describe, it, expect, vi, beforeEach } from "vitest";

// supabaseAdmin 모킹 — 체인형 빌더 + auth.getUser 둘 다 흉내
const rows = [
  {
    checkin_at: "2026-05-08T10:00:00+09:00",
    summary: "어제 무릎이 좀 시큰거리셨다고 함. 산책은 짧게 다녀오심.",
    condition_level: "ok",
    mood_status: "calm",
  },
  {
    checkin_at: "2026-05-07T09:30:00+09:00",
    summary: "혈압약 잊지 않고 드셨고, 식사 잘 하심.",
    condition_level: "ok",
    mood_status: "happy",
  },
  {
    checkin_at: "2026-05-06T10:10:00+09:00",
    summary: "잠을 잘 못 주무셨다고 함.",
    condition_level: "warning",
    mood_status: "tired",
  },
];

const limitMock = vi.fn().mockResolvedValue({ data: rows, error: null });

vi.mock("@/integrations/supabase/client.server", () => {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
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

  it("최근 3일 요약을 system prompt 섹션으로 포맷한다", async () => {
    const out = await buildAiMemoryContext("fake-jwt");
    expect(out).toContain("[지난 대화 기억");
    expect(out).toContain("무릎이 좀 시큰거리셨다");
    expect(out).toContain("혈압약");
    expect(out).toContain("잠을 잘 못 주무셨");
    // 활용 규칙도 포함되어야 한다
    expect(out).toContain("활용 규칙");
  });

  it("오늘(KST) 자정 이전 데이터만 가져오도록 lt 필터를 건다", async () => {
    await buildAiMemoryContext("fake-jwt");
    const builder: any = (supabaseAdmin.from as any).mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith("senior_user_id", "senior-uuid-1");
    expect(builder.lt).toHaveBeenCalledWith("checkin_at", expect.any(String));
    expect(builder.order).toHaveBeenCalledWith("checkin_at", { ascending: false });
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
