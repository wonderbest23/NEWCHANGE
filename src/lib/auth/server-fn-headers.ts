import { getCachedAccessToken } from "@/lib/auth/session-cache";

/**
 * Returns the Authorization header for calling auth-protected createServerFn endpoints.
 * Throws if the user is not signed in.
 */
export async function authHeaders(): Promise<{ Authorization: string }> {
  const token = await getCachedAccessToken();
  return { Authorization: `Bearer ${token}` };
}
