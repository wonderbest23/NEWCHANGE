/**
 * Care Dashboard — server functions
 *
 * 실제 Care DB(care_recipients / call_sessions / anomaly_alerts)에서 읽어오는
 * 보호자 대시보드 전용 read-only 쿼리 묶음. RLS는 family_members → user_family_ids()
 * 함수로 자동 격리된다.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CareRecipientRow {
  id: string;
  display_name: string;
  phone_e164: string;
  status: string;
  call_window_start: string;
  call_window_end: string;
  do_not_disturb: boolean;
  family_id: string;
}

export interface CallSessionRow {
  id: string;
  care_recipient_id: string;
  status: string;
  end_reason: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  wrong_person_flag: boolean;
}

export interface AnomalyAlertRow {
  id: string;
  care_recipient_id: string;
  rule_code: string;
  severity: string;
  status: string;
  guardian_message: string;
  // TanStack 직렬화 추론과 호환되는 가장 느슨한 객체 타입.
  // 화면에서는 표시 X — DB 의 jsonb 그대로 통과.
  // eslint-disable-next-line @typescript-eslint/ban-types
  evidence: {};
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface CareOverview {
  recipients: CareRecipientRow[];
  recentSessions: CallSessionRow[];
  openAlerts: AnomalyAlertRow[];
  totals: {
    recipients: number;
    open_alerts: number;
    critical_open: number;
  };
}

/**
 * 보호자 홈 한 화면용 묶음 쿼리.
 * - recipients: 내가 속한 family 의 모든 돌봄 대상자
 * - recentSessions: 최근 20건 통화 세션
 * - openAlerts: status='open' 이상징후 알림
 */
export const getCareOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CareOverview> => {
    const { supabase } = context;

    const [recipientsRes, sessionsRes, alertsRes] = await Promise.all([
      supabase
        .from("care_recipients")
        .select(
          "id, display_name, phone_e164, status, call_window_start, call_window_end, do_not_disturb, family_id",
        )
        .order("created_at", { ascending: true }),
      supabase
        .from("call_sessions")
        .select(
          "id, care_recipient_id, status, end_reason, started_at, ended_at, duration_sec, wrong_person_flag",
        )
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(20),
      supabase
        .from("anomaly_alerts")
        .select(
          "id, care_recipient_id, rule_code, severity, status, guardian_message, evidence, created_at, acknowledged_at, resolved_at",
        )
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (recipientsRes.error) throw recipientsRes.error;
    if (sessionsRes.error) throw sessionsRes.error;
    if (alertsRes.error) throw alertsRes.error;

    const recipients = (recipientsRes.data ?? []) as CareRecipientRow[];
    const recentSessions = (sessionsRes.data ?? []) as CallSessionRow[];
    const openAlerts = (alertsRes.data ?? []) as AnomalyAlertRow[];

    return {
      recipients,
      recentSessions,
      openAlerts,
      totals: {
        recipients: recipients.length,
        open_alerts: openAlerts.length,
        critical_open: openAlerts.filter((a) => a.severity === "critical").length,
      },
    };
  });
