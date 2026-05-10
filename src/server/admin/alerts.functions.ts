/**
 * Admin Alerts — 관리자 전용 anomaly_alerts 운영 server functions.
 *
 * - 관리자(app_role='admin')만 호출 가능. service role 로 RLS 우회.
 * - 목록: status / severity / 자치구 필터 지원.
 * - 액션: acknowledge / resolve / dismiss.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface AdminAlertRow {
  id: string;
  care_recipient_id: string;
  recipient_name: string | null;
  rule_code: string;
  severity: string;
  guardian_message: string;
  evidence: Record<string, never>;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface AdminAlertsResult {
  alerts: AdminAlertRow[];
  counts: { open: number; acknowledged: number; resolved: number; total: number };
  bySeverity: { critical: number; warning: number; info: number };
}

const FilterSchema = z
  .object({
    status: z.enum(["open", "acknowledged", "resolved", "dismissed", "all"]).optional(),
    severity: z.enum(["critical", "warning", "info", "all"]).optional(),
  })
  .optional();

const SEV_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin" as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden_admin_only");
}

export const getAdminAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => FilterSchema.parse(d))
  .handler(async ({ data, context }): Promise<AdminAlertsResult> => {
    await assertAdmin(context.userId);
    const status = data?.status ?? "open";
    const severity = data?.severity ?? "all";

    let q = supabaseAdmin
      .from("anomaly_alerts")
      .select(
        "id, care_recipient_id, rule_code, severity, guardian_message, evidence, status, created_at, acknowledged_at, resolved_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (status !== "all") q = q.eq("status", status);
    if (severity !== "all") q = q.eq("severity", severity);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r) => r.care_recipient_id)));
    let nameMap = new Map<string, string>();
    if (ids.length > 0) {
      const { data: recs } = await supabaseAdmin
        .from("care_recipients")
        .select("id, display_name")
        .in("id", ids);
      nameMap = new Map((recs ?? []).map((r) => [r.id, r.display_name]));
    }

    const alerts: AdminAlertRow[] = (rows ?? []).map((r) => ({
      id: r.id,
      care_recipient_id: r.care_recipient_id,
      recipient_name: nameMap.get(r.care_recipient_id) ?? null,
      rule_code: r.rule_code,
      severity: r.severity,
      guardian_message: r.guardian_message,
      evidence: (r.evidence ?? {}) as Record<string, never>,
      status: r.status,
      created_at: r.created_at,
      acknowledged_at: r.acknowledged_at,
      resolved_at: r.resolved_at,
    }));

    alerts.sort((a, b) => {
      const sa = SEV_RANK[a.severity] ?? 9;
      const sb = SEV_RANK[b.severity] ?? 9;
      if (sa !== sb) return sa - sb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const { data: countRows } = await supabaseAdmin
      .from("anomaly_alerts")
      .select("status, severity");
    const counts = { open: 0, acknowledged: 0, resolved: 0, total: 0 };
    const bySeverity = { critical: 0, warning: 0, info: 0 };
    for (const r of countRows ?? []) {
      counts.total++;
      if (r.status === "open") counts.open++;
      else if (r.status === "acknowledged") counts.acknowledged++;
      else if (r.status === "resolved") counts.resolved++;
      if (r.status === "open") {
        if (r.severity === "critical") bySeverity.critical++;
        else if (r.severity === "warning") bySeverity.warning++;
        else if (r.severity === "info") bySeverity.info++;
      }
    }

    return { alerts, counts, bySeverity };
  });

const ActionSchema = z.object({
  alertId: z.string().uuid(),
  action: z.enum(["acknowledge", "resolve", "dismiss"]),
  note: z.string().max(500).optional(),
});

export const adminChangeAlertStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const now = new Date().toISOString();
    const update: {
      status?: string;
      acknowledged_at?: string | null;
      acknowledged_by?: string | null;
      resolved_at?: string | null;
    } = {};
    let actionType: string;
    if (data.action === "acknowledge") {
      update.status = "acknowledged";
      update.acknowledged_at = now;
      update.acknowledged_by = context.userId;
      actionType = "acknowledged";
    } else if (data.action === "resolve") {
      update.status = "resolved";
      update.resolved_at = now;
      update.acknowledged_at = now;
      update.acknowledged_by = context.userId;
      actionType = "called";
    } else {
      update.status = "dismissed";
      update.resolved_at = now;
      actionType = "dismissed";
    }
    const { error } = await supabaseAdmin
      .from("anomaly_alerts")
      .update(update)
      .eq("id", data.alertId);
    if (error) return { ok: false as const, error: error.message };

    await supabaseAdmin.from("guardian_actions").insert({
      alert_id: data.alertId,
      guardian_id: context.userId,
      action: actionType,
      note: data.note ?? null,
    });

    return { ok: true as const, status: update.status as string };
  });
