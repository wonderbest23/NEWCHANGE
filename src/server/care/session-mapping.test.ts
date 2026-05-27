/**
 * mapIncomingSipToSession — SIP header → call_sessions 매핑 검증.
 *
 * 검증 항목:
 *  - X-Session-Id 가 1순위로 매칭된다.
 *  - X-Job-Id 가 2순위로 매칭된다.
 *  - 두 헤더 모두 없으면, 최근 5분 dialing job 이 정확히 1건일 때만 매칭한다.
 *  - dialing job 이 2건 이상이면 ambiguous → null 반환 (잘못된 매핑 방지).
 *  - dialing job 이 0건이면 null.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

interface FakeRow {
  table: string;
  filters: Record<string, unknown>;
  result: { data: unknown; error: null };
}

interface FakeState {
  rows: FakeRow[];
  dialingJobs: Array<{ id: string; care_recipient_id: string }>;
  sessionsByJobId: Record<string, { id: string; job_id: string; care_recipient_id: string }>;
  sessionsById: Record<string, { id: string; job_id: string | null; care_recipient_id: string }>;
}

let state: FakeState;

vi.mock("@/integrations/supabase/client.server", () => {
  function arrayResult(table: string, filters: Record<string, unknown>, n: number) {
    if (table === "outbound_call_jobs" && filters.status === "dialing") {
      return { data: state.dialingJobs.slice(0, n), error: null };
    }
    return { data: [], error: null };
  }
  function singleResult(table: string, filters: Record<string, unknown>) {
    if (table === "call_sessions" && filters.id) {
      return { data: state.sessionsById[filters.id as string] ?? null, error: null };
    }
    if (table === "call_sessions" && filters.job_id) {
      return {
        data: state.sessionsByJobId[filters.job_id as string] ?? null,
        error: null,
      };
    }
    return { data: null, error: null };
  }

  const supabaseAdmin = {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      // limit-resolved (thenable) chain with maybeSingle still attached.
      const buildLimitNode = (n: number) => {
        const node: Record<string, unknown> = {};
        node.maybeSingle = async () => singleResult(table, filters);
        node.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          try {
            resolve(arrayResult(table, filters, n));
          } catch (e) {
            reject?.(e);
          }
        };
        return node;
      };
      const api: Record<string, unknown> = {};
      api.select = () => api;
      api.eq = (k: string, v: unknown) => {
        filters[k] = v;
        return api;
      };
      api.gte = () => api;
      api.order = () => api;
      api.limit = (n: number) => buildLimitNode(n);
      api.maybeSingle = async () => singleResult(table, filters);
      return api;
    },
  };
  return { supabaseAdmin };
});

import { mapIncomingSipToSession } from "./session-mapping.server";

beforeEach(() => {
  state = {
    rows: [],
    dialingJobs: [],
    sessionsByJobId: {},
    sessionsById: {},
  };
});

describe("mapIncomingSipToSession", () => {
  it("1순위: X-Session-Id 헤더로 직접 매칭", async () => {
    state.sessionsById["sess-A"] = { id: "sess-A", job_id: "job-A", care_recipient_id: "rec-1" };
    const result = await mapIncomingSipToSession({ "X-Session-Id": "sess-A" });
    expect(result?.matchedBy).toBe("x_session_id");
    expect(result?.sessionId).toBe("sess-A");
  });

  it("2순위: X-Job-Id 헤더 → 가장 최근 call_sessions", async () => {
    state.sessionsByJobId["job-B"] = {
      id: "sess-B",
      job_id: "job-B",
      care_recipient_id: "rec-2",
    };
    const result = await mapIncomingSipToSession({ "X-Job-Id": "job-B" });
    expect(result?.matchedBy).toBe("x_job_id");
    expect(result?.sessionId).toBe("sess-B");
  });

  it("3순위: 헤더 없음 + dialing job 정확히 1건이면 매칭", async () => {
    state.dialingJobs = [{ id: "job-C", care_recipient_id: "rec-3" }];
    state.sessionsByJobId["job-C"] = {
      id: "sess-C",
      job_id: "job-C",
      care_recipient_id: "rec-3",
    };
    const result = await mapIncomingSipToSession({ From: "+15551234567" });
    expect(result?.matchedBy).toBe("single_dialing_job");
    expect(result?.sessionId).toBe("sess-C");
  });

  it("ambiguous: dialing job 2건 이상이면 매칭하지 않는다", async () => {
    state.dialingJobs = [
      { id: "job-D1", care_recipient_id: "rec-4" },
      { id: "job-D2", care_recipient_id: "rec-5" },
    ];
    state.sessionsByJobId["job-D1"] = {
      id: "sess-D1",
      job_id: "job-D1",
      care_recipient_id: "rec-4",
    };
    const result = await mapIncomingSipToSession({ From: "+15551234567" });
    expect(result).toBeNull();
  });

  it("dialing job 이 0건이면 null", async () => {
    state.dialingJobs = [];
    const result = await mapIncomingSipToSession({ From: "+15551234567" });
    expect(result).toBeNull();
  });

  it("X-Session-Id 가 있어도 row 가 없으면 X-Job-Id 로 fallback 한다", async () => {
    state.sessionsByJobId["job-E"] = {
      id: "sess-E",
      job_id: "job-E",
      care_recipient_id: "rec-6",
    };
    const result = await mapIncomingSipToSession({
      "X-Session-Id": "nonexistent",
      "X-Job-Id": "job-E",
    });
    expect(result?.matchedBy).toBe("x_job_id");
    expect(result?.sessionId).toBe("sess-E");
  });
});
