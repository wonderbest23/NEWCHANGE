/**
 * Operational alerts — webhook / pipeline 실패를 운영 담당자에게 알린다.
 *
 * 일반 anomaly_alerts 와는 분리한다:
 *   - anomaly_alerts 는 보호자가 보는 "부모님 건강 신호" 이고 RLS 가 보호자 컨텍스트.
 *   - ops alerts 는 시스템 운영자가 봐야 하는 시스템 장애 (매핑 실패, accept 실패 등).
 *
 * 채널:
 *   - OPS_ALERT_PHONE (E.164) 가 설정돼 있으면 SMS enqueue (notification_outbox).
 *   - 미설정이면 ERROR 로그만 — 빌드/배포 단계에서 환경 변수 설정 안내.
 *
 * 멱등성:
 *   - dedupeKey 가 주어지면 같은 키의 ops alert 가 최근 30분 내 이미 발송됐다면 skip.
 *     (SMS spam 방지)
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueSms } from "@/server/notifications/outbox.server";
import { isValidE164 } from "@/server/notifications/sms.server";

export interface OpsAlertParams {
  /** 영문 슬러그 — 'sip_mapping_failed', 'openai_accept_failed', etc. */
  kind: string;
  /** 사람이 읽을 한 줄 요약. SMS 본문에 그대로 들어감. */
  message: string;
  /** 추가 컨텍스트 — JSON 으로 payload 에 보관. */
  context?: Record<string, unknown>;
  /** 같은 key 의 ops alert 가 30분 이내 enqueued 됐다면 skip. */
  dedupeKey?: string;
}

const OPS_TEMPLATE = "ops_system_alert_v1";
const DEDUPE_WINDOW_MIN = 30;

export async function fireOpsAlert(params: OpsAlertParams): Promise<{ ok: boolean; deduped?: boolean }> {
  // 항상 ERROR 로그는 남긴다 — CF Logs / Sentry 등에서 잡힘.
  console.error(`[ops-alert] ${params.kind}: ${params.message}`, params.context ?? {});

  const opsPhone = process.env.OPS_ALERT_PHONE;
  if (!opsPhone || !isValidE164(opsPhone)) {
    return { ok: false };
  }

  if (params.dedupeKey) {
    const windowStart = new Date(Date.now() - DEDUPE_WINDOW_MIN * 60 * 1000).toISOString();
    const existing = await supabaseAdmin
      .from("notification_outbox")
      .select("id")
      .eq("template_code", OPS_TEMPLATE)
      .contains("payload", { dedupe_key: params.dedupeKey } as never)
      .gte("created_at", windowStart)
      .limit(1);
    if (existing.data && existing.data.length > 0) {
      return { ok: true, deduped: true };
    }
  }

  const res = await enqueueSms({
    recipient: opsPhone,
    body: `[ops:${params.kind}] ${params.message}`.slice(0, 320),
    templateCode: OPS_TEMPLATE,
    alertId: null,
    metadata: {
      kind: params.kind,
      dedupe_key: params.dedupeKey,
      context: params.context ?? {},
    },
  });
  return { ok: res.ok };
}
