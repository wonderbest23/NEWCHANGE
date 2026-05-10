/**
 * SIP / OpenAI Realtime 세션 ↔ call_sessions 매핑.
 *
 * 매핑 우선순위 (.lovable/plan.md §3.3.1):
 *   1) sip_headers["X-Session-Id"]  → call_sessions.id 직접 조회
 *   2) sip_headers["X-Job-Id"]      → outbound_call_jobs.id → 가장 최근 call_sessions
 *   3) sip From 번호(E.164) + 최근 5분 내 status='dialing' outbound_call_jobs
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
  matchedBy: "x_session_id" | "x_job_id" | "from_number";
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

function extractE164FromSipHeader(value: string | undefined): string | null {
  if (!value) return null;
  // 예: "<sip:+821012345678@host>;tag=..." 또는 "+821012345678"
  const m = value.match(/\+\d{8,15}/);
  return m ? m[0] : null;
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

  // 3) From 번호 + 최근 dialing job
  const fromHeader = pick(sipHeaders, "From") ?? pick(sipHeaders, "P-Asserted-Identity");
  const e164 = extractE164FromSipHeader(fromHeader);
  if (e164) {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recipient } = await supabaseAdmin
      .from("care_recipients")
      .select("id")
      .eq("phone_e164", e164)
      .maybeSingle();

    if (recipient) {
      const { data: job } = await supabaseAdmin
        .from("outbound_call_jobs")
        .select("id, care_recipient_id")
        .eq("care_recipient_id", recipient.id)
        .eq("status", "dialing")
        .gte("updated_at", fiveMinAgo)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (job) {
        // 해당 job의 가장 최근 call_sessions 찾기 (없으면 신규 row 생성은 호출자 책임)
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
            matchedBy: "from_number",
          };
        }
      }
    }
  }

  return null;
}
