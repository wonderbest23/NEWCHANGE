import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getTodayCheckin } from "@/lib/checkin/checkin-actions";
import { peekCachedSession, getCachedSession } from "@/lib/auth/session-cache";

export type TodayCheckin = Awaited<ReturnType<typeof getTodayCheckin>>;

export const todayCheckinKey = ["today-checkin"] as const;

async function fetchTodayCheckin(): Promise<TodayCheckin> {
  const session = peekCachedSession() ?? (await getCachedSession());
  const token = session?.access_token;
  return await getTodayCheckin({
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  } as Parameters<typeof getTodayCheckin>[0]);
}

// 인증/권한 같은 클라이언트 오류는 재시도해도 결과가 달라지지 않으므로 제외하고,
// 네트워크/일시적 서버 오류만 최대 3회까지 지수 백오프(1s → 2s → 4s, 최대 8s)로 재시도한다.
function isRetriableError(error: unknown): boolean {
  const msg = (error as { message?: string })?.message ?? "";
  // 4xx 인증/권한/요청 오류는 재시도 안 함
  if (/\b(400|401|403|404|422)\b|unauthor|forbidden|not.?found|로그인/i.test(msg)) return false;
  return true;
}

/**
 * 사용 패턴별 권장 캐시 프로필.
 * - active: 사용자가 곧 다시 볼 가능성이 높은 화면(홈/체크인). 짧은 stale로 신선도 확보.
 * - background: 위젯/사이드 영역. 자주 바뀌지 않으므로 길게 캐싱.
 * - realtime: 방금 안부를 끝낸 직후 등 즉시 최신값이 필요한 흐름.
 */
export const TODAY_CHECKIN_CACHE_PROFILES = {
  active: { staleTime: 60_000, gcTime: 5 * 60_000 },
  background: { staleTime: 5 * 60_000, gcTime: 30 * 60_000 },
  realtime: { staleTime: 0, gcTime: 5 * 60_000 },
} as const;

export type TodayCheckinCacheProfile = keyof typeof TODAY_CHECKIN_CACHE_PROFILES;

export type TodayCheckinCacheOptions = {
  /** 미리 정의된 캐시 프로필 */
  profile?: TodayCheckinCacheProfile;
  /** 직접 지정한 staleTime (profile 보다 우선) */
  staleTime?: number;
  /** 직접 지정한 gcTime (profile 보다 우선) */
  gcTime?: number;
};

function resolveCache(opts?: TodayCheckinCacheOptions) {
  const base = TODAY_CHECKIN_CACHE_PROFILES[opts?.profile ?? "active"];
  return {
    staleTime: opts?.staleTime ?? base.staleTime,
    gcTime: opts?.gcTime ?? base.gcTime,
  };
}

function buildQueryOptions(opts?: TodayCheckinCacheOptions) {
  const { staleTime, gcTime } = resolveCache(opts);
  return {
    queryKey: todayCheckinKey,
    queryFn: fetchTodayCheckin,
    staleTime,
    gcTime,
    retry: (failureCount: number, error: unknown) => {
      if (!isRetriableError(error)) return false;
      return failureCount < 3;
    },
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 8000),
    meta: { silent: true },
  } as const;
}

const TOAST_ID = "today-checkin-error";

export type UseTodayCheckinOptions = TodayCheckinCacheOptions & {
  enabled?: boolean;
};

/**
 * 공통 today-checkin 쿼리 훅.
 * - 실패 시: 재시도 버튼이 포함된 에러 토스트 표시
 * - 캐시 정책: profile 또는 staleTime/gcTime으로 직접 조정 가능
 */
export function useTodayCheckin(opts?: UseTodayCheckinOptions) {
  const qc = useQueryClient();
  const query = useQuery({
    ...buildQueryOptions(opts),
    enabled: opts?.enabled ?? true,
  });

  const shownRef = useRef(false);
  useEffect(() => {
    if (query.isError) {
      if (shownRef.current) return;
      shownRef.current = true;
      toast.error("오늘 안부 정보를 불러오지 못했어요.", {
        id: TOAST_ID,
        description: "네트워크 상태를 확인하고 다시 시도해주세요.",
        duration: 8000,
        action: {
          label: "다시 시도",
          onClick: () => {
            shownRef.current = false;
            toast.dismiss(TOAST_ID);
            void qc.refetchQueries({ queryKey: todayCheckinKey });
          },
        },
      });
    } else if (query.isSuccess) {
      shownRef.current = false;
      toast.dismiss(TOAST_ID);
    }
  }, [query.isError, query.isSuccess, query.errorUpdatedAt, qc]);

  return query;
}

export function useInvalidateTodayCheckin() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: todayCheckinKey });
}

/**
 * 링크 hover/focus 또는 탐색 직전 호출해서 체크인 페이지 진입 전에
 * 데이터를 미리 받아둔다. 이미 fresh 캐시가 있으면 네트워크를 호출하지 않는다.
 */
export function usePrefetchTodayCheckin(opts?: TodayCheckinCacheOptions) {
  const qc = useQueryClient();
  return () => {
    void qc.prefetchQuery(buildQueryOptions(opts));
  };
}

export function prefetchTodayCheckin(qc: QueryClient, opts?: TodayCheckinCacheOptions) {
  return qc.prefetchQuery(buildQueryOptions(opts));
}
