/**
 * OpenAI API 베이스 URL.
 *
 * - 로컬 개발 (.env): OPENAI_BASE_URL 미설정 → api.openai.com 직접 호출
 * - Cloudflare 배포 (wrangler.jsonc vars): OPENAI_BASE_URL = AI Gateway URL
 *   → CF AI Gateway 가 라우팅을 책임져 region 차단을 우회
 *
 * 인증은 항상 process.env.OPENAI_API_KEY 로 동일. base URL 만 환경별로 바뀜.
 *
 * 서버에서 발급하는 Realtime ephemeral token(`/realtime/client_secrets`)도
 * Workers 배포 시 OPENAI_BASE_URL(AI Gateway)을 탄다. Gateway 없이 api.openai.com
 * 직접 호출하면 edge IP가 unsupported region 으로 403 난다.
 *
 * 브라우저 WebRTC SDP(`/realtime/calls`)는 사용자 네트워크에서 OpenAI 직접 연결.
 */
const DEFAULT_OPENAI = "https://api.openai.com/v1";

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

const configuredBase =
  (typeof process !== "undefined" && process?.env?.OPENAI_BASE_URL) || DEFAULT_OPENAI;

export const OPENAI_BASE_URL: string = normalizeBase(configuredBase);

/** 서버 Realtime token 발급 — Gateway/직접 URL 모두 OPENAI_BASE_URL 과 동일 정책 */
export const OPENAI_REALTIME_BASE_URL: string = normalizeBase(
  (typeof process !== "undefined" && process?.env?.OPENAI_REALTIME_BASE_URL) || configuredBase,
);
