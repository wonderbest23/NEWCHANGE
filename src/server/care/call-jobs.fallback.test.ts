/**
 * handleNoAnswerFallback — reason 별 차등 정책 검증.
 *
 * 검증 항목:
 *  - reason='failed' 은 retry/SMS 둘 다 하지 않는다 (skipped_failed_no_retry).
 *  - reason='no_answer' 첫 실패는 30분 뒤 retry job 을 만든다.
 *  - reason='busy' 첫 실패는 10분 뒤 retry job 을 만든다 (no_answer 보다 짧다).
 *  - 동일 parent_job_id 에 이미 retry job 이 있으면 중복 생성하지 않는다.
 *  - 두 번째 실패(retry_count >= 1)면 SMS fallback 으로 떨어진다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface JobRow {
  id: string;
  retry_count: number;
  parent_job_id: string | null;
  reason: string | null;
}

interface FakeState {
  job: JobRow;
  session: { id: string; job_id: string | null };
  existingRetryJobs: Array<{ id: string }>;
  existingSms: Array<{ id: string; status: string }>;
  recipientPhone: string | null;
  insertedJobs: Array<Record<string, unknown>>;
  enqueuedSms: Array<Record<string, unknown>>;
}

let state: FakeState;

vi.mock("@/integrations/supabase/client.server", () => {
  const builder = (table: string) => {
    let mode: "select" | "update" | "insert" = "select";
    let filters: Record<string, unknown> = {};
    let updatePatch: Record<string, unknown> = {};
    let insertRow: Record<string, unknown> | null = null;
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.eq = (col: string, val: unknown) => {
      filters[col] = val;
      return api;
    };
    api.in = () => api;
    api.contains = () => api;
    api.limit = () => api;
    api.maybeSingle = async () => resolveSingle(table, filters, mode);
    api.single = async () => {
      const result = await resolveSingle(table, filters, mode);
      // insert.single
      if (mode === "insert" && insertRow) {
        if (table === "outbound_call_jobs") {
          state.insertedJobs.push(insertRow);
          return { data: { id: `new-job-${state.insertedJobs.length}` }, error: null };
        }
      }
      return result;
    };
    api.update = (patch: Record<string, unknown>) => {
      mode = "update";
      updatePatch = patch;
      return api;
    };
    api.insert = (row: Record<string, unknown>) => {
      mode = "insert";
      insertRow = row;
      return api;
    };
    api.then = undefined;
    // For .insert(...).select("id").single() chain: select must remain available after insert.
    return api;
  };

  function resolveSingle(table: string, filters: Record<string, unknown>, mode: string) {
    if (table === "call_sessions" && mode === "select") {
      return { data: state.session, error: null };
    }
    if (table === "outbound_call_jobs" && mode === "select") {
      // retry-existing check or job lookup
      if ("parent_job_id" in filters && filters.reason === "retry") {
        return { data: state.existingRetryJobs[0] ?? null, error: null };
      }
      if ("id" in filters) {
        return { data: state.job, error: null };
      }
      return { data: state.job, error: null };
    }
    if (table === "care_recipients" && mode === "select") {
      return {
        data: state.recipientPhone ? { phone_e164: state.recipientPhone } : null,
        error: null,
      };
    }
    if (table === "notification_outbox" && mode === "select") {
      return { data: state.existingSms, error: null };
    }
    return { data: null, error: null };
  }

  const supabaseAdmin = {
    from: (table: string) => {
      // Each call needs a fresh builder so chains don't bleed across.
      const b = builder(table);
      // override eq for limit/contains chains that return arrays
      const arrayApi: Record<string, unknown> = { ...b };
      arrayApi.limit = async () => {
        if (table === "outbound_call_jobs") {
          return { data: state.existingRetryJobs, error: null };
        }
        if (table === "notification_outbox") {
          return { data: state.existingSms, error: null };
        }
        return { data: [], error: null };
      };
      // Allow b.select(...).eq(...).limit(n) chain to resolve to array.
      const wrap: Record<string, unknown> = {};
      wrap.select = (..._args: unknown[]) => {
        const next: Record<string, unknown> = {};
        next.eq = (col: string, val: unknown) => {
          (b as { eq: (k: string, v: unknown) => unknown }).eq(col, val);
          return next;
        };
        next.contains = () => next;
        next.in = () => next;
        next.limit = async (_n: number) => {
          if (table === "outbound_call_jobs") {
            return { data: state.existingRetryJobs, error: null };
          }
          if (table === "notification_outbox") {
            return { data: state.existingSms, error: null };
          }
          return { data: [], error: null };
        };
        next.maybeSingle = async () => {
          if (table === "call_sessions") return { data: state.session, error: null };
          if (table === "outbound_call_jobs") return { data: state.job, error: null };
          if (table === "care_recipients") {
            return {
              data: state.recipientPhone ? { phone_e164: state.recipientPhone } : null,
              error: null,
            };
          }
          return { data: null, error: null };
        };
        next.single = async () => ({ data: { id: "new-job" }, error: null });
        return next;
      };
      wrap.update = (patch: Record<string, unknown>) => {
        return { eq: () => ({ data: null, error: null }) };
      };
      wrap.insert = (row: Record<string, unknown>) => {
        if (table === "outbound_call_jobs") {
          state.insertedJobs.push(row);
        }
        return {
          select: () => ({
            single: async () => ({
              data: { id: `new-job-${state.insertedJobs.length}` },
              error: null,
            }),
          }),
        };
      };
      return wrap;
    },
  };
  return { supabaseAdmin };
});

vi.mock("@/server/notifications/outbox.server", () => ({
  enqueueSms: vi.fn(async (params: Record<string, unknown>) => {
    state.enqueuedSms.push(params);
    return { ok: true, outboxId: `sms-${state.enqueuedSms.length}` };
  }),
}));

vi.mock("@/server/notifications/sms.server", () => ({
  isValidE164: (p: string) => /^\+\d{8,15}$/.test(p),
}));

import { handleNoAnswerFallback } from "./call-jobs.server";

beforeEach(() => {
  state = {
    job: { id: "job-1", retry_count: 0, parent_job_id: null, reason: null },
    session: { id: "sess-1", job_id: "job-1" },
    existingRetryJobs: [],
    existingSms: [],
    recipientPhone: "+821012345678",
    insertedJobs: [],
    enqueuedSms: [],
  };
});

describe("handleNoAnswerFallback — reason 차등", () => {
  it("reason='failed' 은 retry/SMS 둘 다 하지 않는다", async () => {
    const r = await handleNoAnswerFallback({
      sessionId: "sess-1",
      recipientId: "rec-1",
      reason: "failed",
    });
    expect(r.action).toBe("skipped_failed_no_retry");
    expect(state.insertedJobs).toHaveLength(0);
    expect(state.enqueuedSms).toHaveLength(0);
  });

  it("reason='no_answer' 첫 실패 → 30분 뒤 retry job", async () => {
    const before = Date.now();
    const r = await handleNoAnswerFallback({
      sessionId: "sess-1",
      recipientId: "rec-1",
      reason: "no_answer",
    });
    expect(r.action).toBe("retry_scheduled");
    expect(state.insertedJobs).toHaveLength(1);
    const scheduled = new Date(state.insertedJobs[0].scheduled_at as string).getTime();
    const delayMs = scheduled - before;
    // 30분 ± 5초 허용 (테스트 안정성)
    expect(delayMs).toBeGreaterThan(30 * 60 * 1000 - 5000);
    expect(delayMs).toBeLessThan(30 * 60 * 1000 + 5000);
  });

  it("reason='busy' 첫 실패 → 10분 뒤 retry job (no_answer 보다 빠름)", async () => {
    const before = Date.now();
    const r = await handleNoAnswerFallback({
      sessionId: "sess-1",
      recipientId: "rec-1",
      reason: "busy",
    });
    expect(r.action).toBe("retry_scheduled");
    expect(state.insertedJobs).toHaveLength(1);
    const scheduled = new Date(state.insertedJobs[0].scheduled_at as string).getTime();
    const delayMs = scheduled - before;
    expect(delayMs).toBeGreaterThan(10 * 60 * 1000 - 5000);
    expect(delayMs).toBeLessThan(10 * 60 * 1000 + 5000);
  });

  it("이미 retry job 이 있으면 중복 생성하지 않는다", async () => {
    state.existingRetryJobs = [{ id: "retry-existing" }];
    const r = await handleNoAnswerFallback({
      sessionId: "sess-1",
      recipientId: "rec-1",
      reason: "no_answer",
    });
    expect(r.action).toBe("retry_already_scheduled");
    expect(state.insertedJobs).toHaveLength(0);
  });

  it("retry_count >= 1 이면 SMS fallback 으로 떨어진다", async () => {
    state.job.retry_count = 1;
    const r = await handleNoAnswerFallback({
      sessionId: "sess-1",
      recipientId: "rec-1",
      reason: "no_answer",
    });
    expect(r.action).toBe("sms_enqueued");
    expect(state.enqueuedSms).toHaveLength(1);
    expect(state.insertedJobs).toHaveLength(0);
  });
});
