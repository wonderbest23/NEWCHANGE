/**
 * Guardian Alerts — 보호자 알림 조회 및 상태 변경 server functions.
 *
 * 7단계: anomaly_alerts 실제 DB 연동.
 *
 * - 조회: requireSupabaseAuth + RLS (can_access_recipient) 통해 안전.
 * - 상태 변경: anomaly_alerts 는 사용자 INSERT/UPDATE 정책이 없으므로
 *   서버에서 권한을 직접 확인한 뒤 service role 로 update.
 * - guardian_actions 는 RLS INSERT 정책이 있어 사용자 토큰으로 기록.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface GuardianAlertRow {
  id: string;
  care_recipient_id: string;
  recipient_name: string | null;
  rule_code: string;
  severity: "info" | "warning" | "critical" | string;
  guardian_message: string;
  // eslint-disable-next-line @typescript-eslint/ban-types
  evidence: {};
  status: "open" | "acknowledged" | "resolved" | "dismissed" | string;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface GuardianAlertsResult {
  alerts: GuardianAlertRow[];
  counts: { open: number; acknowledged: number; resolved: number; total: number };
}

const FilterSchema = z
  .object({
    filter: z.enum(["open", "acknowledged", "resolved", "all"]).optional(),
  })
  .optional();

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export const getGuardianAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => FilterSchema.parse(d))
  .handler(async ({ data, context }): Promise<GuardianAlertsResult> => {
    const { supabase } = context;
    const filter = data?.filter ?? "open";

    // RLS: can_access_recipient(care_recipient_id) — 보호자 권한 자동 필터.
    let q = supabase
      .from("anomaly_alerts")
      .select(
        "id, care_recipient_id, rule_code, severity, guardian_message, evidence, status, created_at, acknowledged_at, resolved_at",
      );
    if (filter !== "all") q = q.eq("status", filter);
    const { data: rows, error } = await q.order("created_at", { ascending: false });
    if (error) throw error;

    // recipient 이름 매핑 (RLS 통과 분량만)
    const ids = Array.from(new Set((rows ?? []).map((r) => r.care_recipient_id)));
    let nameMap = new Map<string, string>();
    if (ids.length > 0) {
      const { data: recs } = await supabase
        .from("care_recipients")
        .select("id, display_name")
        .in("id", ids);
      nameMap = new Map((recs ?? []).map((r) => [r.id, r.display_name]));
    }

    const alerts: GuardianAlertRow[] = (rows ?? []).map((r) => ({
      id: r.id,
      care_recipient_id: r.care_recipient_id,
      recipient_name: nameMap.get(r.care_recipient_id) ?? null,
      rule_code: r.rule_code,
      severity: r.severity,
      guardian_message: r.guardian_message,
      evidence: (r.evidence ?? {}) as object,
      status: r.status,
      created_at: r.created_at,
      acknowledged_at: r.acknowledged_at,
      resolved_at: r.resolved_at,
    }));

    // critical 먼저, 그다음 최신순
    alerts.sort((a, b) => {
      const sa = SEVERITY_RANK[a.severity] ?? 9;
      const sb = SEVERITY_RANK[b.severity] ?? 9;
      if (sa !== sb) return sa - sb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // counts: 권한 통과 전체에서 status 별 집계
    const { data: countRows } = await supabase
      .from("anomaly_alerts")
      .select("status");
    const counts = { open: 0, acknowledged: 0, resolved: 0, total: 0 };
    for (const r of countRows ?? []) {
      counts.total++;
      if (r.status === "open") counts.open++;
      else if (r.status === "acknowledged") counts.acknowledged++;
      else if (r.status === "resolved") counts.resolved++;
    }

    return { alerts, counts };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 상태 변경
// ─────────────────────────────────────────────────────────────────────────────

const ActionSchema = z.object({
  alertId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

type AlertAction = "acknowledge" | "resolve" | "dismiss";

async function changeAlertStatus(opts: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
  alertId: string;
  action: AlertAction;
  note?: string;
}): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const { supabase, userId, alertId, action, note } = opts;

  // 1) 권한 확인: RLS 가 통과되는 행만 보임. 못 보면 권한 없음.
  const { data: alert, error: selErr } = await supabase
    .from("anomaly_alerts")
    .select("id, care_recipient_id, status")
    .eq("id", alertId)
    .maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };
  if (!alert) return { ok: false, error: "alert_not_found_or_forbidden" };

  // 2) status 전이 결정
  const now = new Date().toISOString();
  const update: {
    status?: string;
    acknowledged_at?: string | null;
    acknowledged_by?: string | null;
    resolved_at?: string | null;
  } = {};
  let actionType: string;
  if (action === "acknowledge") {
    update.status = "acknowledged";
    update.acknowledged_at = now;
    update.acknowledged_by = userId;
    actionType = "acknowledged";
  } else if (action === "resolve") {
    update.status = "resolved";
    update.resolved_at = now;
    if (alert.status === "open") {
      update.acknowledged_at = now;
      update.acknowledged_by = userId;
    }
    actionType = "called"; // schema 의 guardian action enum 후보 중 하나
  } else {
    update.status = "dismissed";
    update.resolved_at = now;
    actionType = "dismissed";
  }

  // 3) 사용자 RLS 로는 UPDATE 불가 → service role 로 업데이트.
  //    권한은 위에서 RLS SELECT 통과로 검증됨.
  const { error: upErr } = await supabaseAdmin
    .from("anomaly_alerts")
    .update(update)
    .eq("id", alertId);
  if (upErr) return { ok: false, error: upErr.message };

  // 4) guardian_actions 기록 (사용자 토큰으로 RLS INSERT)
  const { error: gaErr } = await supabase.from("guardian_actions").insert({
    alert_id: alertId,
    guardian_id: userId,
    action: actionType,
    note: note ?? null,
  });
  if (gaErr) {
    console.warn("[guardian_actions] insert failed:", gaErr.message);
    // status update 는 성공이므로 실패시켜도 의미 없음.
  }

  return { ok: true, status: update.status ?? "" };
}

export const acknowledgeAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    return changeAlertStatus({
      supabase: context.supabase,
      userId: context.userId,
      alertId: data.alertId,
      action: "acknowledge",
      note: data.note,
    });
  });

export const resolveAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    return changeAlertStatus({
      supabase: context.supabase,
      userId: context.userId,
      alertId: data.alertId,
      action: "resolve",
      note: data.note,
    });
  });

export const dismissAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    return changeAlertStatus({
      supabase: context.supabase,
      userId: context.userId,
      alertId: data.alertId,
      action: "dismiss",
      note: data.note,
    });
  });
