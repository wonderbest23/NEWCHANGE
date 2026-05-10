// 사용자별 앱 상태(역할/가족/목적지)를 React Query로 캐싱해
// 페이지마다 getMyAppState를 중복 호출하지 않도록 한다.
import { useQuery } from "@tanstack/react-query";
import { getCachedAccessToken } from "@/lib/auth/session-cache";
import { getMyAppState, type MyAppState } from "@/lib/auth/role-actions";
import { useAuth } from "@/lib/auth/mock-auth";

async function fetchAppState(): Promise<MyAppState> {
  const token = await getCachedAccessToken();
  return getMyAppState({
    headers: { Authorization: `Bearer ${token}` },
  } as Parameters<typeof getMyAppState>[0]);
}

/**
 * 현재 사용자의 앱 상태를 반환한다. 같은 세션 내 여러 컴포넌트가 호출해도
 * React Query 캐시 덕분에 서버 함수는 한 번만 실행된다.
 */
export function useAppState(options?: { enabled?: boolean }) {
  const { isAuthenticated, loading: authLoading, userId } = useAuth();
  return useQuery({
    queryKey: ["app-state", userId],
    enabled: (options?.enabled ?? true) && !authLoading && isAuthenticated && !!userId,
    queryFn: fetchAppState,
    // 역할/가족 등록 여부는 거의 안 바뀜 → 캐시 5분
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}

export const APP_STATE_QUERY_KEY = ["app-state"] as const;
