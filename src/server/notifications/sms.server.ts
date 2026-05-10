/**
 * SMS sender (server-only).
 *
 * Twilio Messages API REST 호출. Basic Auth.
 * 절대 클라이언트 코드에서 import 하지 말 것.
 *
 * 입력: to (E.164), body, messageType, metadata
 * 출력: { ok, sid?, status?, error? }
 */

const E164_KR_OR_GENERIC = /^\+[1-9]\d{6,14}$/;

export type SmsMessageType =
  | "parent_call_fallback" // 부모님에게 통화 미응답 보조 SMS
  | "guardian_alert"       // 보호자에게 critical alert 통보
  | "test";

export interface SendSmsParams {
  to: string;
  body: string;
  messageType: SmsMessageType;
  metadata?: Record<string, unknown>;
}

export interface SendSmsResult {
  ok: boolean;
  sid?: string;
  status?: string;
  error?: string;
  httpStatus?: number;
}

function getCreds(): { sid: string; token: string; from: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

export function isValidE164(n: string | null | undefined): boolean {
  if (!n) return false;
  return E164_KR_OR_GENERIC.test(n);
}

export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  if (!isValidE164(params.to)) {
    return { ok: false, error: `invalid_e164:${params.to}` };
  }
  const creds = getCreds();
  if (!creds) {
    return {
      ok: false,
      error: "missing_twilio_credentials (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER)",
    };
  }

  const auth = Buffer.from(`${creds.sid}:${creds.token}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Messages.json`;
  const form = new URLSearchParams({
    To: params.to,
    From: creds.from,
    Body: params.body,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      code?: number;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        error: json.message ?? `twilio_http_${res.status}`,
      };
    }
    console.log("[sms] sent", { type: params.messageType, sid: json.sid, to: params.to });
    return { ok: true, sid: json.sid, status: json.status, httpStatus: res.status };
  } catch (err) {
    return { ok: false, error: `network_error:${String(err)}` };
  }
}
