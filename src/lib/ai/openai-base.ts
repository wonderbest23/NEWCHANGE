/**
 * OpenAI API 베이스 URL.
 *
 * - 로컬 개발 (.env): OPENAI_BASE_URL 미설정 → api.openai.com 직접 호출
 * - Cloudflare 배포 (wrangler.jsonc vars): OPENAI_BASE_URL = AI Gateway URL
 *   → CF AI Gateway 가 라우팅을 책임져 region 차단을 우회
 *
 * 인증은 항상 process.env.OPENAI_API_KEY 로 동일. base URL 만 환경별로 바뀜.
 */
export const OPENAI_BASE_URL: string =
  (typeof process !== "undefined" && process?.env?.OPENAI_BASE_URL) ||
  "https://api.openai.com/v1";
