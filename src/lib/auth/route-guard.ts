// 보호 라우트용 beforeLoad 가드
// supabase 세션이 없으면 /auth로 리다이렉트하며 현재 경로를 token으로 보존하지 않고
// redirect 검색 파라미터로 보존한다.
import { redirect } from "@tanstack/react-router";
import { getCachedSession } from "@/lib/auth/session-cache";

export async function requireAuthBeforeLoad({ location }: { location: { href: string } }) {
  // SSR 환경에서는 세션을 확인할 수 없으므로 가드를 통과시킨다 (보호 라우트는 ssr:false).
  if (typeof window === "undefined") return;
  const session = await getCachedSession();
  if (!session) {
    throw redirect({
      to: "/auth",
      search: { mode: "signin", redirect: location.href } as never,
    });
  }
}
