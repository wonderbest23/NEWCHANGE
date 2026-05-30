import { getCachedAccessToken, peekCachedSession } from "@/lib/auth/session-cache";

/**
 * Returns the Authorization header for calling auth-protected createServerFn endpoints.
 * Throws if the user is not signed in.
 */
export async function authHeaders(): Promise<{ Authorization: string }> {
  const cached = peekCachedSession()?.access_token;
  if (cached) return { Authorization: `Bearer ${cached}` };

  const token = await Promise.race([
    getCachedAccessToken(),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("로그인 세션 확인 시간이 초과됐어요. 다시 로그인해 주세요.")), 8_000),
    ),
  ]);
  return { Authorization: `Bearer ${token}` };
}
