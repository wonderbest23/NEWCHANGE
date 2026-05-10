import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyTwilioPostSignature,
  verifyTwilioGetSignature,
  buildFullUrlFromRequest,
} from "./verify.server";

const TOKEN = "test-auth-token";
const URL_FULL = "https://example.com/api/public/twilio/status";

function sign(url: string, params: Record<string, string>) {
  const sortedKeys = Object.keys(params).sort();
  let payload = url;
  for (const k of sortedKeys) payload += k + params[k];
  return createHmac("sha1", TOKEN).update(payload, "utf8").digest("base64");
}

describe("verifyTwilioPostSignature", () => {
  it("올바른 서명은 통과", () => {
    const params = { CallSid: "CA123", CallStatus: "completed" };
    const sig = sign(URL_FULL, params);
    expect(verifyTwilioPostSignature(sig, URL_FULL, params, TOKEN)).toEqual({ ok: true });
  });

  it("잘못된 서명은 거부", () => {
    const params = { CallSid: "CA123" };
    const r = verifyTwilioPostSignature("zzz", URL_FULL, params, TOKEN);
    expect(r.ok).toBe(false);
  });

  it("서명 헤더 누락 시 거부", () => {
    const r = verifyTwilioPostSignature(null, URL_FULL, {}, TOKEN);
    expect(r).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("auth_token 미설정이면 WARN 통과 (개발 단계 허용)", () => {
    const r = verifyTwilioPostSignature("anything", URL_FULL, {}, undefined);
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("missing_secret");
  });

  it("params 키 정렬은 결과에 영향 없음", () => {
    const a = { B: "2", A: "1" };
    const b = { A: "1", B: "2" };
    const sig = sign(URL_FULL, a);
    expect(verifyTwilioPostSignature(sig, URL_FULL, b, TOKEN).ok).toBe(true);
  });
});

describe("verifyTwilioGetSignature", () => {
  it("query string 포함 URL 만으로 검증", () => {
    const url = "https://example.com/api/public/twilio/twiml/job-1";
    const sig = createHmac("sha1", TOKEN).update(url, "utf8").digest("base64");
    expect(verifyTwilioGetSignature(sig, url, TOKEN).ok).toBe(true);
  });
});

describe("buildFullUrlFromRequest", () => {
  it("X-Forwarded-Proto/Host 우선 사용", () => {
    const req = new Request("http://internal/api/public/twilio/status?x=1", {
      headers: { "x-forwarded-proto": "https", "x-forwarded-host": "example.com" },
    });
    expect(buildFullUrlFromRequest(req)).toBe("https://example.com/api/public/twilio/status?x=1");
  });

  it("프록시 헤더 없으면 request URL 사용", () => {
    const req = new Request("https://example.com/api/public/twilio/status");
    const out = buildFullUrlFromRequest(req);
    expect(out.startsWith("https://example.com")).toBe(true);
  });
});
