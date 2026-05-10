/**
 * Twilio Webhook Signature Verification
 *
 * 표준 X-Twilio-Signature 검증 (HMAC-SHA1, base64).
 * docs: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * 알고리즘:
 *   string_to_sign = full_url + sorted(form_keys + form_values).join('')
 *   signature = base64(HMAC-SHA1(auth_token, string_to_sign))
 *
 * GET (TwiML) 의 경우 query string 까지 포함된 full URL 만 사용 (form 없음).
 *
 * 주의:
 *  - 본 코드는 신뢰된 환경(서버 라우트 핸들러) 에서만 호출.
 *  - TWILIO_AUTH_TOKEN 미설정 시: 개발/파일럿 단계에서는 'WARN' 모드로 통과 시키되,
 *    프로덕션 배포 전 반드시 secret 등록 + 강제 검증으로 전환할 것 (Track B-1).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifyResult {
  ok: boolean;
  reason?: "missing_secret" | "missing_signature" | "mismatch" | "no_check_get";
}

function buildExpectedSignature(
  authToken: string,
  fullUrl: string,
  params: Record<string, string>,
): string {
  const sortedKeys = Object.keys(params).sort();
  let payload = fullUrl;
  for (const k of sortedKeys) payload += k + params[k];
  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

/** form-encoded POST 검증 (status / recording 콜백 등) */
export function verifyTwilioPostSignature(
  signatureHeader: string | null,
  fullUrl: string,
  formParams: Record<string, string>,
  authToken: string | undefined,
): VerifyResult {
  if (!authToken) {
    console.warn("[twilio:verify] TWILIO_AUTH_TOKEN 미설정 — 검증 통과 처리. Track B-1 에서 secret 추가 필수.");
    return { ok: true, reason: "missing_secret" };
  }
  if (!signatureHeader) return { ok: false, reason: "missing_signature" };

  const expected = buildExpectedSignature(authToken, fullUrl, formParams);
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: "mismatch" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "mismatch" };
}

/**
 * GET (TwiML 발급) 검증.
 * Twilio 는 TwiML URL 호출 시에도 X-Twilio-Signature 를 보내며,
 * 이때는 form params 가 없으므로 fullUrl 만 사용한다.
 */
export function verifyTwilioGetSignature(
  signatureHeader: string | null,
  fullUrl: string,
  authToken: string | undefined,
): VerifyResult {
  return verifyTwilioPostSignature(signatureHeader, fullUrl, {}, authToken);
}

/** Request 객체 → 정규화된 full URL (proto+host+path+query). */
export function buildFullUrlFromRequest(request: Request): string {
  // X-Forwarded-Proto/Host 우선 (Cloudflare/프록시 환경)
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}${url.pathname}${url.search}`;
}

/** FormData → Record<string,string> (마지막 값 우선) */
export function formDataToRecord(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = typeof v === "string" ? v : v.name;
  return out;
}
