/**
 * OpenAI Webhook Signature Verification
 *
 * OpenAI Realtime SIP webhook은 다음 헤더를 보낸다:
 *  - webhook-id        : unique id
 *  - webhook-timestamp : unix seconds
 *  - webhook-signature : "v1,<base64(HMAC-SHA256(secret, signed_payload))> ..." (공백 구분 다중 가능)
 *
 * signed_payload = `${id}.${timestamp}.${rawBody}`
 *
 * 주의:
 *  - OPENAI_WEBHOOK_SECRET 미설정 시 파일럿 단계에서는 WARN 통과 (Track B-1).
 *  - 프로덕션 전 강제 검증으로 전환할 것.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifyResult {
  ok: boolean;
  reason?: "missing_secret" | "missing_headers" | "stale" | "mismatch";
}

const TOLERANCE_SECONDS = 5 * 60; // 5분

export function verifyOpenAIWebhook(opts: {
  id: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
  rawBody: string;
  secret: string | undefined;
  now?: number;
}): VerifyResult {
  const { id, timestamp, signatureHeader, rawBody, secret } = opts;

  if (!secret) {
    console.warn(
      "[openai:verify] OPENAI_WEBHOOK_SECRET 미설정 — 검증 통과 처리. 파일럿 이후 강제 검증 필수.",
    );
    return { ok: true, reason: "missing_secret" };
  }

  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, reason: "missing_headers" };
  }

  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return { ok: false, reason: "missing_headers" };
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) return { ok: false, reason: "stale" };

  const signedPayload = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest("base64");

  // signatureHeader 형식: "v1,abc... v1,def..." — 어느 하나라도 매칭되면 OK
  const parts = signatureHeader.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    const sig = part.startsWith("v1,") ? part.slice(3) : part;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true };
  }
  return { ok: false, reason: "mismatch" };
}
