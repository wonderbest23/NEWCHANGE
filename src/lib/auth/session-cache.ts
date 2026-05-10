// 전역 Supabase 세션 캐시.
// onAuthStateChange를 구독해 항상 최신 세션을 메모리에 보관한다.
// 각 페이지/훅은 supabase.auth.getSession()을 직접 호출하지 않고
// getCachedSession() / getCachedAccessToken()을 사용해 중복 네트워크/IO를 제거한다.
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

let cachedSession: Session | null = null;
let initialPromise: Promise<Session | null> | null = null;
let subscribed = false;

function ensureSubscribed() {
  if (subscribed || typeof window === "undefined") return;
  subscribed = true;
  // 1) 리스너부터 등록 — 이후 모든 변경은 자동 동기화됨
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedSession = session ?? null;
  });
}

/**
 * 현재 캐시된 세션을 반환한다. 최초 호출 시 한 번만 getSession()을 실행하고
 * 이후에는 onAuthStateChange로 동기화된 값을 즉시 반환한다.
 */
export function getCachedSession(): Promise<Session | null> {
  ensureSubscribed();
  if (cachedSession) return Promise.resolve(cachedSession);
  if (initialPromise) return initialPromise;
  initialPromise = supabase.auth
    .getSession()
    .then(({ data }) => {
      cachedSession = data.session ?? null;
      return cachedSession;
    })
    .catch(() => null)
    .finally(() => {
      // 다음 호출부터는 cachedSession 또는 새 promise 사용
      initialPromise = null;
    }) as Promise<Session | null>;
  return initialPromise;
}

/** 동기적으로 캐시된 세션을 반환 (없으면 null). */
export function peekCachedSession(): Session | null {
  return cachedSession;
}

/** 인증 헤더용 access_token 헬퍼. 없으면 throw. */
export async function getCachedAccessToken(): Promise<string> {
  const session = await getCachedSession();
  const token = session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다");
  return token;
}

/**
 * supabase.auth.getSession()와 동일한 반환 shape을 가진 캐시 버전.
 * 기존 호출부의 디스트럭처링 패턴을 그대로 유지할 수 있도록 함.
 */
export async function getSessionCached(): Promise<{ data: { session: Session | null } }> {
  const session = peekCachedSession() ?? (await getCachedSession());
  return { data: { session } };
}
