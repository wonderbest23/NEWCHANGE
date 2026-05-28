import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { haversineM, CATCH_RADIUS_M } from "@/lib/game/geo";
import {
  acceptWalkMonsterConsent,
  catchWalkMonster,
  forceSpawnNearby,
  getWalkMonsterProfile,
  resetWalkMonsterSession,
  syncWalkMonsterSession,
} from "@/lib/game/walk-monster-actions";
import { ARWalkSession, type ArSpawn } from "@/components/game/ARWalkSession";
import { useGameCatchFeed } from "@/hooks/useGameCatchFeed";
import { supabase } from "@/integrations/supabase/client";

type UserPos = { lat: number; lng: number };

/**
 * Walk-Monster 진입점.
 *
 * UX 흐름:
 *  1) gateError 면 차단 안내
 *  2) profile 로딩 중이면 spinner
 *  3) profile 에러 → 재시도
 *  4) 동의 안 됨 → 단 한 장 짜리 "동의하고 시작" 화면
 *     (이 버튼 클릭 → 동의 저장 + 카메라 권한 요청 + GPS 권한 → AR 세션 진입)
 *  5) 동의 됨 → 항상 풀스크린 ARWalkSession 표시
 *
 * 카드 스크롤 UI 는 ARWalkSession 안의 메뉴(sheet) 로 이동.
 */
export function WalkMonsterBeta({ gateError }: { gateError?: string }) {
  const qc = useQueryClient();
  const [tracking, setTracking] = useState(false);
  const [userPos, setUserPos] = useState<UserPos | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [exited, setExited] = useState(false);
  const lastPosRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const pendingSyncRef = useRef(false);
  // 최근 4개 GPS 샘플의 moving average buffer. 한자리 GPS 떨림 억제용.
  const gpsBufferRef = useRef<Array<{ lat: number; lng: number }>>([]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user?.id) setCurrentUserId(data.user.id);
    });
  }, []);

  useGameCatchFeed(currentUserId);

  // 위치를 ~50m 단위로 quantize 해 GPS 가 조금만 변해도 캐시 키가 안 바뀌게.
  const posBucket = userPos
    ? {
        lat: Math.round(userPos.lat * 2000) / 2000,
        lng: Math.round(userPos.lng * 2000) / 2000,
      }
    : null;
  const profileQ = useQuery({
    queryKey: ["walk-monster-profile", posBucket?.lat, posBucket?.lng],
    queryFn: async () =>
      getWalkMonsterProfile({
        data: userPos ? { latitude: userPos.lat, longitude: userPos.lng } : undefined,
        headers: await authHeaders(),
      } as Parameters<typeof getWalkMonsterProfile>[0]),
    enabled: !gateError,
    staleTime: 15_000,
    retry: 1,
  });

  const refreshUserPosition = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  }, []);

  useEffect(() => {
    if (!gateError && profileQ.data?.profile?.has_consent) {
      refreshUserPosition();
    }
  }, [gateError, profileQ.data?.profile?.has_consent, refreshUserPosition]);

  // ── GPS 추적 lifecycle ────────────────────────────────────────
  const handlePosition = useCallback(
    (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;

      // GPS 정확도가 30m 이상이면 표시·서버 모두 무시 (PDF 가이드).
      if (typeof accuracy === "number" && accuracy > 30) return;

      // moving average: 최근 4개 raw GPS 의 평균을 표시·서버 모두에 사용.
      // 작은 흔들림에 의한 몬스터 떨림을 줄임.
      const buf = gpsBufferRef.current;
      buf.push({ lat: latitude, lng: longitude });
      if (buf.length > 4) buf.shift();
      const avgLat = buf.reduce((s, p) => s + p.lat, 0) / buf.length;
      const avgLng = buf.reduce((s, p) => s + p.lng, 0) / buf.length;

      setUserPos({ lat: avgLat, lng: avgLng });
      const now = Date.now();
      let deltaM = 0;
      const prev = lastPosRef.current;
      if (prev) {
        deltaM = haversineM(prev.lat, prev.lng, avgLat, avgLng);
        const dt = (now - prev.t) / 1000;
        if (dt > 0 && deltaM / dt > 12) return;
        if (deltaM < 2) return;
      }
      lastPosRef.current = { lat: avgLat, lng: avgLng, t: now };
      if (pendingSyncRef.current || deltaM < 2) return;
      pendingSyncRef.current = true;
      syncMut.mutate(
        {
          latitude: avgLat,
          longitude: avgLng,
          accuracy_m: accuracy ?? null,
          client_delta_m: Math.round(deltaM),
        },
        {
          onSettled: () => {
            pendingSyncRef.current = false;
          },
        },
      );
    },
    // syncMut 은 stable ref 가 아니지만 useCallback dep 으로 넣지 않아도 closure 가 항상 최신 mutate 를 참조.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("이 기기는 위치 추적을 지원하지 않아요");
      return;
    }
    if (watchIdRef.current != null) return; // 이미 진행 중
    setTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      (err) => {
        stopTracking();
        toast.error(
          err.code === err.PERMISSION_DENIED ? "위치 권한을 허용해 주세요" : "위치 추적 오류",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }, [handlePosition, stopTracking]);

  useEffect(() => () => stopTracking(), [stopTracking]);

  // ── Mutations ────────────────────────────────────────────────
  const consentMut = useMutation({
    mutationFn: async () =>
      acceptWalkMonsterConsent({
        headers: await authHeaders(),
      } as Parameters<typeof acceptWalkMonsterConsent>[0]),
    onSuccess: async () => {
      toast.success("스타터 아이템이 지급됐어요!");
      qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
      // 권한 요청은 사용자 제스처 안에서 진행. 거부되어도 진행 가능.
      try {
        if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
          const s = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
          // 권한만 확보. 실제 stream 은 ARWalkSession 이 다시 켠다.
          s.getTracks().forEach((t) => t.stop());
        }
      } catch {
        toast.message("카메라 권한이 필요해요. AR 화면에서 다시 한 번 허용해 주세요.");
      }
      refreshUserPosition();
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
      // 동의 직후 AR 진입 (exited 초기화).
      setExited(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "저장 실패"),
  });

  const syncMut = useMutation({
    mutationFn: async (payload: {
      latitude: number;
      longitude: number;
      accuracy_m: number | null;
      client_delta_m: number;
    }) =>
      syncWalkMonsterSession({
        data: payload,
        headers: await authHeaders(),
      } as Parameters<typeof syncWalkMonsterSession>[0]),
    onSuccess: (res) => {
      if (!res.ok) {
        if (res.reason === "gps_weak") toast.info(res.message);
        else if (res.reason === "speed") toast.warning(res.message);
        return;
      }
      if (res.new_spawns?.length) {
        toast.success(`몬스터가 나타났어요! (${res.new_spawns.length}마리)`);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("산책 몬스터", {
            body: "근처에 몬스터가 나타났어요! AR 화면에서 잡으세요.",
          });
        }
      }
      qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
    },
  });

  const catchMut = useMutation({
    mutationFn: async (payload: {
      spawn_id: string;
      latitude: number;
      longitude: number;
      use_orb?: boolean;
    }) =>
      catchWalkMonster({
        data: payload,
        headers: await authHeaders(),
      } as Parameters<typeof catchWalkMonster>[0]),
    onSuccess: (res) => {
      if (!res.ok) {
        const msg =
          res.reason === "daily_limit"
            ? "오늘 포획 한도에 도달했어요"
            : res.reason === "expired"
              ? "몬스터가 사라졌어요"
              : res.reason === "too_far"
                ? `너무 멀어요 (${"distance_m" in res ? res.distance_m : "?"}m / ${CATCH_RADIUS_M}m 이내)`
                : "포획에 실패했어요";
        toast.error(msg);
        qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
        return;
      }
      toast.success(`${res.monster_emoji} ${res.monster_name} 포획! +${res.xp_gained} XP`);
      qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
      qc.invalidateQueries({ queryKey: ["walk-monster-leaderboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "포획 실패"),
  });

  const forceSpawnMut = useMutation({
    mutationFn: async (payload: { latitude: number; longitude: number }) =>
      forceSpawnNearby({
        data: payload,
        headers: await authHeaders(),
      } as Parameters<typeof forceSpawnNearby>[0]),
    onSuccess: (res) => {
      if (!res.ok) {
        const msg =
          res.reason === "cooldown"
            ? "30초마다 한 번씩 소환할 수 있어요"
            : res.reason === "too_many_active"
              ? "이미 주변에 몬스터가 충분해요"
              : res.reason === "no_consent"
                ? "동의가 필요해요"
                : "소환할 수 없어요";
        toast.info(msg);
        return;
      }
      toast.success(`테스트 몬스터 등장! (${res.distance_m}m)`);
      qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
    },
  });

  // 동의 후 활성 스폰이 0개인 첫 1회: 자동으로 테스트 스폰 1마리.
  // 사용자가 걷기 전이라도 바로 게임 흐름을 체험할 수 있게.
  const autoSpawnTriedRef = useRef(false);
  useEffect(() => {
    const data = profileQ.data;
    if (!data || !userPos) return;
    if (!data.profile?.has_consent) return;
    if (autoSpawnTriedRef.current) return;
    if ((data.active_spawns?.length ?? 0) > 0) {
      // 이미 있으면 굳이 시도 안 함.
      autoSpawnTriedRef.current = true;
      return;
    }
    autoSpawnTriedRef.current = true;
    forceSpawnMut.mutate({ latitude: userPos.lat, longitude: userPos.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQ.data, userPos]);

  const resetMut = useMutation({
    mutationFn: async () =>
      resetWalkMonsterSession({
        headers: await authHeaders(),
      } as Parameters<typeof resetWalkMonsterSession>[0]),
    onSuccess: () => {
      lastPosRef.current = null;
      toast.info("이번 산책 거리를 초기화했어요");
      qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
    },
  });

  // ── Render branches ──────────────────────────────────────────
  if (gateError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg text-foreground/80">{gateError}</p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/home">홈으로</Link>
        </Button>
      </div>
    );
  }

  if (profileQ.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (profileQ.isError) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
        <p className="text-lg text-foreground/80">프로필을 불러오지 못했어요.</p>
        <p className="text-xs text-foreground/55">
          {profileQ.error instanceof Error ? profileQ.error.message : "잠시 후 다시 시도해 주세요."}
        </p>
        <Button onClick={() => profileQ.refetch()}>다시 시도</Button>
      </div>
    );
  }

  const data = profileQ.data;
  const profile = data?.profile;

  if (!profile?.has_consent) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-between px-4 py-10">
        <header>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">베타</p>
          <h1 className="font-display text-3xl text-foreground">산책 몬스터</h1>
          <p className="mt-3 text-fluid-sm text-foreground/65">
            걸으며 몬스터를 찾고, 카메라 AR로 바로 잡아요.
          </p>
        </header>
        <Card className="space-y-4 border-border p-5">
          <div className="space-y-2 text-fluid-sm text-foreground/75">
            <p>· 위치 권한: 몬스터 스폰·거리 계산</p>
            <p>· 카메라 권한: AR 포획</p>
            <p>· {CATCH_RADIUS_M}m 이내에서 포획 가능</p>
            <p>· 스타터 아이템 지급</p>
          </div>
          <Button
            size="lg"
            className="h-16 w-full gap-2 rounded-2xl text-lg"
            disabled={consentMut.isPending}
            onClick={() => consentMut.mutate()}
          >
            {consentMut.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                <Camera className="h-5 w-5" />
                동의하고 카메라 시작
              </>
            )}
          </Button>
          <p className="text-center text-[11px] text-foreground/55">
            누르면 카메라·위치 권한 요청 후 바로 AR 화면이 열려요.
          </p>
        </Card>
        <p className="text-center text-xs text-foreground/45">
          <Link to="/home" className="underline">
            나중에 할게요
          </Link>
        </p>
      </div>
    );
  }

  // 동의 완료 — 풀스크린 AR 세션. exited 상태면 미니 진입 화면.
  if (exited) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display text-2xl text-foreground">산책 몬스터</h1>
        <p className="text-sm text-foreground/65">
          AR 카메라를 다시 켜고 사냥을 시작하세요.
        </p>
        <Button
          size="lg"
          className="h-14 w-full max-w-sm gap-2 rounded-2xl text-base"
          onClick={() => setExited(false)}
        >
          <Camera className="h-5 w-5" />
          AR 카메라 시작
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/home">홈으로</Link>
        </Button>
      </div>
    );
  }

  const spawns = (data?.active_spawns ?? []) as ArSpawn[];

  return (
    <ARWalkSession
      profile={{
        level: profile.level,
        xp: profile.xp,
        coins: profile.coins,
        total_catches: profile.total_catches,
        session_distance_m: profile.session_distance_m,
        spawn_progress_m: profile.spawn_progress_m,
        spawn_threshold_m: profile.spawn_threshold_m,
        catch_radius_m: profile.catch_radius_m ?? CATCH_RADIUS_M,
      }}
      spawns={spawns}
      inventory={data?.inventory ?? []}
      catchesToday={data?.catches_today ?? 0}
      dailyLimit={data?.daily_limit ?? 30}
      userPos={userPos}
      isTracking={tracking}
      isCatching={catchMut.isPending}
      onStartTracking={startTracking}
      onStopTracking={stopTracking}
      onResetSession={() => resetMut.mutate()}
      onRefreshPosition={refreshUserPosition}
      onCatch={(spawn, useOrb) => {
        if (!userPos) {
          toast.info("위치를 확인한 뒤 다시 시도해 주세요");
          refreshUserPosition();
          return;
        }
        catchMut.mutate({
          spawn_id: spawn.id,
          latitude: userPos.lat,
          longitude: userPos.lng,
          use_orb: useOrb,
        });
      }}
      onExit={() => {
        stopTracking();
        setExited(true);
      }}
      onForceSpawn={() => {
        if (!userPos) {
          toast.info("위치를 확인한 뒤 다시 시도해 주세요");
          refreshUserPosition();
          return;
        }
        forceSpawnMut.mutate({ latitude: userPos.lat, longitude: userPos.lng });
      }}
      isSpawning={forceSpawnMut.isPending}
    />
  );
}
