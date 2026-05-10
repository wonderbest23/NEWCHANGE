/**
 * Notification dispatcher — alert → channels → outbox enqueue
 *
 * MVP: outbox insert 까지의 흐름만 정의. 실제 worker 는 Cursor 인계 후.
 */

import type { AnomalyAlert, FamilyMember, NotificationOutboxRow } from "../care/types";
import { channelsForSeverity } from "./adapters";

export interface OutboxInsert
  extends Omit<NotificationOutboxRow, "id" | "created_at" | "status" | "attempt_count" | "sent_at" | "last_error"> {
  status: "queued";
  attempt_count: 0;
}

/**
 * 알림 1건 + 가족 구성원 목록 → outbox row 들 생성
 *
 * critical: primary_guardian 즉시 + secondary_guardian 60s 지연
 * warning : primary_guardian 만
 * info    : 발송 없음 (카드만)
 */
export function buildOutboxRows(
  alert: AnomalyAlert,
  members: FamilyMember[],
  templateCode: string,
  payload: Record<string, unknown>,
): OutboxInsert[] {
  const channels = channelsForSeverity(alert.severity);
  if (channels.length === 0) return [];

  const primary = members.filter((m) => m.role === "primary_guardian");
  const secondary = members.filter((m) => m.role === "secondary_guardian");

  const rows: OutboxInsert[] = [];
  const now = new Date().toISOString();
  const fanoutDelay = new Date(Date.now() + 60_000).toISOString();

  const enqueue = (m: FamilyMember, channel: NotificationOutboxRow["channel"], scheduled_at: string) => {
    const recipient =
      channel === "email" ? m.email :
      channel === "kakao" || channel === "sms" ? m.phone_e164 :
      m.user_id;
    if (!recipient) return;
    rows.push({
      alert_id: alert.id,
      channel,
      template_code: templateCode,
      recipient,
      payload,
      scheduled_at,
      status: "queued",
      attempt_count: 0,
    });
  };

  for (const m of primary) {
    for (const ch of channels) enqueue(m, ch, now);
  }

  if (alert.severity === "critical") {
    // T+60s fan-out
    for (const m of secondary) {
      for (const ch of channels) enqueue(m, ch, fanoutDelay);
    }
  }

  return rows;
}

/**
 * rule_code → kakao template_code 매핑 (docs/policy/08-kakao-templates.md)
 */
export function templateForRule(ruleCode: string): string {
  switch (ruleCode) {
    case "R001": return "T008_NO_RESPONSE_48H";
    case "R002": return "T003_MEAL_SKIPPED_2D";
    case "R003": return "T004_MED_MISSED_REPEAT";
    case "R004": return "T005_FALL_MENTIONED";
    case "R005": return "T006_VITAL_EMERGENCY";
    case "R006": return "T007_MOOD_CONCERN";
    case "R007": return "T001_DAILY_SUMMARY";
    case "R008": return "T002_CALL_NO_ANSWER";
    case "R009": return "T004_MED_MISSED_REPEAT";
    default:     return "T001_DAILY_SUMMARY";
  }
}
