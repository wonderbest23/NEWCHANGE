import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Footprints,
  Loader2,
  MapPin,
  Pause,
  Play,
  Sparkles,
  Target,
  Coins,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { haversineM, CATCH_RADIUS_M } from "@/lib/game/geo";
import { monsterByKey, RARITY_META } from "@/lib/game/monsters";
import {
  acceptWalkMonsterConsent,
  catchWalkMonster,
  getWalkMonsterProfile,
  resetWalkMonsterSession,
  syncWalkMonsterSession,
} from "@/lib/game/walk-monster-actions";
import { cn } from "@/lib/utils";
import { MonsterCatchCamera } from "@/components/game/MonsterCatchCamera";
import { SpawnRadarMap } from "@/components/game/SpawnRadarMap";
import { GameInventoryPanel } from "@/components/game/GameInventoryPanel";
import { GameLeaderboard } from "@/components/game/GameLeaderboard";

type ActiveSpawn = {
  id: string;
  monster_key: string;
  rarity: "common" | "rare" | "legendary";
  latitude: number;
  longitude: number;
  distance_m: number | null;
  in_range: boolean;
};

type UserPos = { lat: number; lng: number };

export function WalkMonsterBeta({ gateError }: { gateError?: string }) {
  const qc = useQueryClient();
  const [tracking, setTracking] = useState(false);
  const [userPos, setUserPos] = useState<UserPos | null>(null);
  const [catchTarget, setCatchTarget] = useState<ActiveSpawn | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const [useOrb, setUseOrb] = useState(false);
  const lastPosRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const pendingSyncRef = useRef(false);

  const profileQ = useQuery({
    queryKey: ["walk-monster-profile", userPos?.lat, userPos?.lng],
    queryFn: async () =>
      getWalkMonsterProfile({
        data: userPos ? { latitude: userPos.lat, longitude: userPos.lng } : undefined,
        headers: await authHeaders(),
      } as Parameters<typeof getWalkMonsterProfile>[0]),
    enabled: !gateError,
  });

  const inventory = profileQ.data?.inventory ?? [];
  const orbQty = inventory.find((i) => i.item_key === "capture_orb")?.quantity ?? 0;
  const tapsRequired = useOrb && orbQty > 0 ? 2 : 3;

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

  const consentMut = useMutation({
    mutationFn: async () =>
      acceptWalkMonsterConsent({
        headers: await authHeaders(),
      } as Parameters<typeof acceptWalkMonsterConsent>[0]),
    onSuccess: () => {
      toast.success("동의가 저장되었어요. 스타터 아이템이 지급됐어요!");
      qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
      refreshUserPosition();
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
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
            body: "근처에 몬스터가 나타났어요! 앱에서 포획해 보세요.",
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
        setCatchTarget(null);
        setTapCount(0);
        setUseOrb(false);
        qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
        return;
      }
      toast.success(`${res.monster_emoji} ${res.monster_name} 포획! +${res.xp_gained} XP`);
      setCatchTarget(null);
      setTapCount(0);
      setUseOrb(false);
      qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
      qc.invalidateQueries({ queryKey: ["walk-monster-leaderboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "포획 실패"),
  });

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

  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  }, []);

  const handlePosition = useCallback(
    (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      setUserPos({ lat: latitude, lng: longitude });
      const now = Date.now();
      let deltaM = 0;
      const prev = lastPosRef.current;
      if (prev) {
        deltaM = haversineM(prev.lat, prev.lng, latitude, longitude);
        const dt = (now - prev.t) / 1000;
        if (dt > 0 && deltaM / dt > 12) {
          return;
        }
        if (deltaM < 2) return;
      }
      lastPosRef.current = { lat: latitude, lng: longitude, t: now };

      if (pendingSyncRef.current || deltaM < 2) return;
      pendingSyncRef.current = true;
      syncMut.mutate(
        {
          latitude,
          longitude,
          accuracy_m: accuracy ?? null,
          client_delta_m: Math.round(deltaM),
        },
        { onSettled: () => { pendingSyncRef.current = false; } },
      );
    },
    [syncMut],
  );

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("이 기기는 위치 추적을 지원하지 않아요");
      return;
    }
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

  const openCatch = (spawn: ActiveSpawn) => {
    if (!userPos) {
      toast.info("위치를 확인한 뒤 다시 시도해 주세요");
      refreshUserPosition();
      return;
    }
    if (!spawn.in_range) {
      toast.warning(`${spawn.distance_m ?? "?"}m — ${CATCH_RADIUS_M}m 안으로 가까이 가 주세요`);
      return;
    }
    setCatchTarget(spawn);
    setTapCount(0);
    setUseOrb(orbQty > 0);
  };

  const handleCatchTap = () => {
    if (!catchTarget || catchMut.isPending || !userPos) return;
    const next = tapCount + 1;
    setTapCount(next);
    if (next >= tapsRequired) {
      catchMut.mutate({
        spawn_id: catchTarget.id,
        latitude: userPos.lat,
        longitude: userPos.lng,
        use_orb: useOrb && orbQty > 0,
      });
    }
  };

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

  const data = profileQ.data;
  const profile = data?.profile;
  const spawns = (data?.active_spawns ?? []) as ActiveSpawn[];
  const catchRadius = profile?.catch_radius_m ?? CATCH_RADIUS_M;
  const progressPct = profile
    ? Math.min(100, (profile.spawn_progress_m / profile.spawn_threshold_m) * 100)
    : 0;

  if (!profile?.has_consent) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
        <header>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">베타</p>
          <h1 className="font-display text-3xl text-foreground">산책 몬스터</h1>
          <p className="mt-2 text-fluid-sm text-foreground/65">
            걸으며 몬스터를 찾고, 카메라 AR로 포획하세요. 가방·랭킹·근접 사냥이 추가됐어요.
          </p>
        </header>
        <Card className="space-y-4 border-border p-5">
          <p className="text-fluid-sm text-foreground/75">
            · 위치: 스폰·거리 / 카메라·기울기: AR 포획
            <br />
            · {CATCH_RADIUS_M}m 이내에서만 포획 가능
            <br />· 스타터 포획구·부스터 지급
          </p>
          <Button
            size="lg"
            className="h-14 w-full rounded-2xl text-lg"
            disabled={consentMut.isPending}
            onClick={() => consentMut.mutate()}
          >
            {consentMut.isPending ? <Loader2 className="animate-spin" /> : "동의하고 시작하기"}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6 pb-24">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-primary">베타 · 산책 몬스터</p>
          <h1 className="font-display text-2xl text-foreground">오늘의 산책 사냥</h1>
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link to="/home">나가기</Link>
        </Button>
      </header>

      <Card className="grid grid-cols-3 gap-2 border-border p-4 text-center">
        <div>
          <p className="flex items-center justify-center gap-1 text-lg font-semibold">
            <Star className="h-4 w-4 text-amber-500" />
            Lv.{profile?.level ?? 1}
          </p>
          <p className="text-xs text-foreground/55">{profile?.xp ?? 0} XP</p>
        </div>
        <div>
          <p className="flex items-center justify-center gap-1 text-lg font-semibold">
            <Coins className="h-4 w-4 text-amber-600" />
            {profile?.coins ?? 0}
          </p>
          <p className="text-xs text-foreground/55">코인</p>
        </div>
        <div>
          <p className="text-lg font-semibold">{profile?.total_catches ?? 0}</p>
          <p className="text-xs text-foreground/55">포획</p>
        </div>
      </Card>

      <Card className="space-y-4 border-border p-4">
        <h2 className="text-center text-sm font-medium text-foreground/70">주변 레이더</h2>
        <SpawnRadarMap
          userLat={userPos?.lat ?? null}
          userLng={userPos?.lng ?? null}
          spawns={spawns}
          catchRadiusM={catchRadius}
        />
        <Button variant="outline" size="sm" className="mx-auto flex w-full" onClick={refreshUserPosition}>
          <MapPin className="mr-2 h-4 w-4" />
          내 위치 새로고침
        </Button>
      </Card>

      <Card className="space-y-3 border-border p-4">
        <div className="flex items-center gap-2">
          <Footprints className="h-5 w-5 text-primary" />
          <span className="font-medium">이번 산책 {profile?.session_distance_m ?? 0}m</span>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-foreground/60">
            <span>다음 스폰까지</span>
            <span>
              {profile?.spawn_progress_m ?? 0} / {profile?.spawn_threshold_m ?? 50}m
            </span>
          </div>
          <Progress value={progressPct} className="h-3" />
        </div>
        <div className="flex gap-2">
          {!tracking ? (
            <Button className="h-12 flex-1 rounded-2xl" onClick={startTracking}>
              <Play className="mr-2 h-4 w-4" />
              산책 추적 시작
            </Button>
          ) : (
            <Button className="h-12 flex-1 rounded-2xl" variant="secondary" onClick={stopTracking}>
              <Pause className="mr-2 h-4 w-4" />
              추적 멈춤
            </Button>
          )}
          <Button
            variant="outline"
            className="rounded-2xl"
            disabled={resetMut.isPending}
            onClick={() => resetMut.mutate()}
          >
            초기화
          </Button>
        </div>
        {tracking && (
          <p className="text-center text-xs text-foreground/50">
            <MapPin className="mr-1 inline h-3 w-3" />
            GPS 추적 중… 실외에서 천천히 걸어 주세요
          </p>
        )}
      </Card>

      <GameInventoryPanel inventory={inventory} coins={profile?.coins ?? 0} />

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl">
          <Sparkles className="h-5 w-5 text-primary" />
          근처 몬스터 ({spawns.length})
        </h2>
        {spawns.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-foreground/55">
            아직 몬스터가 없어요. 50m씩 걸으면 나타납니다.
          </p>
        ) : (
          <ul className="space-y-3">
            {spawns.map((s) => {
              const def = monsterByKey(s.monster_key);
              const meta = RARITY_META[s.rarity];
              return (
                <li key={s.id}>
                  <Card
                    className={cn(
                      "flex items-center justify-between gap-3 border-border p-4",
                      s.in_range && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-4xl">{def?.emoji ?? "❓"}</span>
                      <div>
                        <p className="font-semibold">{def?.name ?? s.monster_key}</p>
                        <p className={cn("text-xs", meta.color)}>{meta.label}</p>
                        <p className="text-xs text-foreground/50">
                          {s.distance_m != null ? `${s.distance_m}m` : "—"}
                          {s.in_range ? " · 포획 가능" : ` · ${catchRadius}m 이내로`}
                        </p>
                      </div>
                    </div>
                    <Button
                      className="rounded-xl"
                      variant={s.in_range ? "default" : "outline"}
                      onClick={() => openCatch(s)}
                    >
                      <Target className="mr-1 h-4 w-4" />
                      포획
                    </Button>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <GameLeaderboard />

      <p className="text-center text-xs text-foreground/45">
        오늘 포획 {data?.catches_today ?? 0} / {data?.daily_limit ?? 30}
      </p>

      {catchTarget && (
        <MonsterCatchCamera
          monsterKey={catchTarget.monster_key}
          rarityLabel={RARITY_META[catchTarget.rarity].label}
          tapCount={tapCount}
          tapsRequired={tapsRequired}
          useOrb={useOrb && orbQty > 0}
          onTap={handleCatchTap}
          onClose={() => {
            setCatchTarget(null);
            setTapCount(0);
            setUseOrb(false);
          }}
          disabled={catchMut.isPending}
        />
      )}
    </div>
  );
}
