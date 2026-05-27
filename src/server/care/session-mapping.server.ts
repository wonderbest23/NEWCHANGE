/**
 * SIP / OpenAI Realtime 세션 ↔ call_sessions 매핑.
 *
 * 매핑 우선순위:
 *   1) sip_headers["X-Session-Id"]  → call_sessions.id 직접 조회
 *   2) sip_headers["X-Job-Id"]      → outbound_call_jobs.id → 가장 최근 call_sessions
 *   3) (최후) Twilio FROM 번호(=TWILIO_FROM_NUMBER)와 최근 dialing job의 단일 매칭
 *
 * 주의:
 *   - Twilio→OpenAI SIP bridge에서 OpenAI에 도달하는 SIP From은 발신자 번호
 *     (TWILIO_FROM_NUMBER) 이지 부모님 번호가 아니다.
 *   - 따라서 From 번호로는 "누구에게 거는 통화인지" 직접 식별할 수 없고,
 *     "최근 5분 내 dialing job이 정확히 1건일 때"만 해당 job으로 매칭한다.
 *     dialing job이 0건이거나 2건 이상이면 ambiguous → 매핑 실패.
 *
 * 모두 실패 시 null 반환. 호출자는 webhook 200 응답 + 알람 처리.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface SipHeaders {
  [key: string]: string | undefined;
}

export interface MappedSession {
  sessionId: string;
  jobId: string | null;
  careRecipientId: string;
  matchedBy: "x_session_id" | "x_job_id" | "single_dialing_job";
}

/** SIP 헤더 키는 case-insensitive — 정규화 lookup */
function pick(headers: SipHeaders, key: string): string | undefined {
  if (!headers) return undefined;
  const target = key.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) return headers[k];
  }
  return undefined;
}

export async function mapIncomingSipToSession(
  sipHeaders: SipHeaders,
): Promise<MappedSession | null> {
  // 1) X-Session-Id
  const xSession = pick(sipHeaders, "X-Session-Id");
  if (xSession) {
    const { data, error } = await supabaseAdmin
      .from("call_sessions")
      .select("id, job_id, care_recipient_id")
      .eq("id", xSession)
      .maybeSingle();
    if (!error && data) {
      return {
        sessionId: data.id,
        jobId: data.job_id,
        careRecipientId: data.care_recipient_id,
        matchedBy: "x_session_id",
      };
    }
  }

  // 2) X-Job-Id
  const xJob = pick(sipHeaders, "X-Job-Id");
  if (xJob) {
    const { data, error } = await supabaseAdmin
      .from("call_sessions")
      .select("id, job_id, care_recipient_id, created_at")
      .eq("job_id", xJob)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      return {
        sessionId: data.id,
        jobId: data.job_id,
        careRecipientId: data.care_recipient_id,
        matchedBy: "x_job_id",
      };
    }
  }

  // 3) 최후의 fallback — 최근 5분 내 dialing 상태인 job이 "정확히 1건"인 경우만 사용.
  //    Twilio→OpenAI SIP bridge에서는 SIP From이 발신자(Twilio number)라 부모님 번호를
  //    역으로 매칭할 수 없다. 그래서 "유일한 dialing job" heuristic을 쓴다.
  //    동시 발신이 진행 중이면 ambiguous → null 반환하여 잘못된 매핑을 막는다.
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const dialing = await supabaseAdmin
    .from("outbound_call_jobs")
    .select("id, care_recipient_id")
    .eq("status", "dialing")
    .gte("updated_at", fiveMinAgo)
    .order("updated_at", { ascending: false })
    .limit(2);
  if (!dialing.error && dialing.data && dialing.data.length === 1) {
    const job = dialing.data[0];
    const { data: session } = await supabaseAdmin
      .from("call_sessions")
      .select("id, job_id, care_recipient_id")
      .eq("job_id", job.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (session) {
      return {
        sessionId: session.id,
        jobId: session.job_id,
        careRecipientId: session.care_recipient_id,
        matchedBy: "single_dialing_job",
      };
    }
  } else if (dialing.data && dialing.data.length > 1) {
    console.warn(
      "[session-mapping] ambiguous dialing jobs — refusing fallback",
      dialing.data.length,
    );
  }

  return null;
}
