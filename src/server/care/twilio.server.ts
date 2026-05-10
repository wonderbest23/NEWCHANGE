/**
 * Twilio REST 호출 헬퍼 (서버 전용).
 *
 * 인증: HTTP Basic Auth = base64(`${ACCOUNT_SID}:${AUTH_TOKEN}`)
 * 엔드포인트: https://api.twilio.com/2010-04-01/Accounts/{Sid}/Calls.json
 *
 * 1단계는 발신(Calls.create)만.
 */

interface CreateCallParams {
  to: string;          // E.164
  from: string;        // E.164
  url: string;         // TwiML URL (GET)
  statusCallback: string;
  timeoutSec?: number; // ring timeout
  machineDetection?: "Enable" | "DetectMessageEnd" | "none";
}

export interface TwilioCallResult {
  ok: boolean;
  sid?: string;
  status?: string;
  errorCode?: number;
  errorMessage?: string;
  httpStatus?: number;
}

function getCreds(): { accountSid: string; authToken: string; from: string } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from };
}

export function getTwilioFromNumber(): string | null {
  return process.env.TWILIO_FROM_NUMBER ?? null;
}

export async function createTwilioCall(params: CreateCallParams): Promise<TwilioCallResult> {
  const creds = getCreds();
  if (!creds) {
    return {
      ok: false,
      errorMessage:
        "missing_twilio_credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)",
    };
  }

  const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Calls.json`;

  const form = new URLSearchParams({
    To: params.to,
    From: params.from,
    Url: params.url,
    Method: "GET",
    StatusCallback: params.statusCallback,
    StatusCallbackMethod: "POST",
    Timeout: String(params.timeoutSec ?? 25),
  });
  // 음성 통화 lifecycle 이벤트
  form.append("StatusCallbackEvent", "initiated");
  form.append("StatusCallbackEvent", "ringing");
  form.append("StatusCallbackEvent", "answered");
  form.append("StatusCallbackEvent", "completed");
  if (params.machineDetection && params.machineDetection !== "none") {
    form.append("MachineDetection", params.machineDetection);
  }

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
        errorCode: json.code,
        errorMessage: json.message ?? `twilio_http_${res.status}`,
      };
    }
    return { ok: true, sid: json.sid, status: json.status, httpStatus: res.status };
  } catch (err) {
    return { ok: false, errorMessage: `network_error: ${String(err)}` };
  }
}
