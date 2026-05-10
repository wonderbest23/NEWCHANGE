import { supabase } from "@/integrations/supabase/client";
import type { AnalyticsEventName } from "./eventNames";

type TrackEventParams = {
  eventName: AnalyticsEventName;
  userRole?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * 사용자 행동 이벤트를 analytics_events 테이블에 비동기 저장합니다.
 * - 실패해도 사용자 흐름을 막지 않습니다(throw 안 함, console.warn).
 * - 민감정보(원본 음성, 전화번호, 질병명 등)는 sanitize로 제거.
 */
export async function trackEvent({
  eventName,
  userRole = null,
  targetType = null,
  targetId = null,
  metadata = {},
}: TrackEventParams) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return; // RLS상 익명 INSERT는 차단됨

    const safeMetadata = sanitizeAnalyticsMetadata(metadata);

    const { error } = await supabase.from("analytics_events").insert({
      user_id: user.id,
      user_role: userRole,
      event_name: eventName,
      target_type: targetType,
      target_id: targetId,
      metadata: safeMetadata as never,
    } as never);

    if (error) {
      console.warn("[analytics] failed to track event", eventName, error.message);
    }
  } catch (err) {
    console.warn("[analytics] unexpected tracking error", eventName, err);
  }
}

const BLOCKED_METADATA_KEYS = new Set([
  "rawTranscript",
  "transcript",
  "voiceText",
  "phone",
  "phoneNumber",
  "contactPhone",
  "residentRegistrationNumber",
  "diseaseName",
  "medicineName",
  "addressDetail",
  "address",
  "email",
  "name",
]);

function sanitizeAnalyticsMetadata(metadata: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (BLOCKED_METADATA_KEYS.has(key)) continue;
    if (typeof value === "string" && value.length > 200) {
      result[key] = value.slice(0, 200);
    } else {
      result[key] = value;
    }
  }
  return result;
}
