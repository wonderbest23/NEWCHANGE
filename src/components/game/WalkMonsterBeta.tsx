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
import { monsterByKey, RARITY_META } from "@/lib/game/monsters";
import {
  acceptWalkMonsterConsent,
  catchWalkMonster,
  getWalkMonsterProfile,
  resetWalkMonsterSession,
  syncWalkMonsterSession,
} from "@/lib/game/walk-monster-actions";
import { cn } from "@/lib/utils";

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type ActiveSpawn = {
  id: string;
  monster_key: string;
  rarity: "common" | "rare" | "legendary";
  latitude: number;
  longitude: number;
};

export function WalkMonsterBeta({ gateError }: { gateError?: string }) {
  const qc = useQueryClient();
  const [tracking, setTracking] = useState(false);
  const [catchTarget, setCatchTarget] = useState<ActiveSpawn | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const lastPosRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const pendingSyncRef = useRef(false);

  const profileQ = useQuery({
    queryKey: ["walk-monster-profile"],
    queryFn: async () =>
      getWalkMonsterProfile({
        headers: await authHeaders(),
      } as Parameters<typeof getWalkMonsterProfile>[0]),
    enabled: !gateError,
  });

  const consentMut = useMutation({
    mutationFn: async () =>
      acceptWalkMonsterConsent({
        headers: await authHeaders(),
      } as Parameters<typeof acceptWalkMonsterConsent>[0]),
    onSuccess: () => {
      toast.success("동의가 저장되었어요. 산책을 시작해 보세요!");
      qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
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
      }
      qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
    },
  });

  const catchMut = useMutation({
    mutationFn: async (spawnId: string) =>
      catchWalkMonster({
        data: { spawn_id: spawnId },
        headers: await authHeaders(),
      } as Parameters<typeof catchWalkMonster>[0]),
    onSuccess: (res) => {
      if (!res.ok) {
        const msg =
          res.reason === "daily_limit"
            ? "오늘 포획 한도에 도달했어요"
            : res.reason === "expired"
              ? "몬스터가 사라졌어요"
              : "포획에 실패했어요";
        toast.error(msg);
        setCatchTarget(null);
        setTapCount(0);
        qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
        return;
      }
      toast.success(`${res.monster_emoji} ${res.monster_name} 포획! +${res.xp_gained} XP`);
      setCatchTarget(null);
      setTapCount(0);
      qc.invalidateQueries({ queryKey: ["walk-monster-profile"] });
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

  const handleCatchTap = () => {
    if (!catchTarget || catchMut.isPending) return;
    const next = tapCount + 1;
    setTapCount(next);
    if (next >= 3) {
      catchMut.mutate(catchTarget.id);
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
            밖에서 걸으면 주변에 몬스터가 나타나요. 카메라 AR은 다음 단계예요 — 지금은 탭으로
            포획합니다.
          </p>
        </header>
        <Card className="space-y-4 border-border p-5">
          <p className="text-fluid-sm text-foreground/75">
            · 위치 정보는 게임 스폰·이동 거리 계산에만 씁니다.
            <br />
            · 안부 산책 인증과 별도로 동작합니다.
            <br />· 베타 기간에는 URL로만 접근할 수 있어요.
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
            <Button className="flex-1 rounded-2xl h-12" onClick={startTracking}>
              <Play className="mr-2 h-4 w-4" />
              산책 추적 시작
            </Button>
          ) : (
            <Button className="flex-1 rounded-2xl h-12" variant="secondary" onClick={stopTracking}>
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
                  <Card className="flex items-center justify-between gap-3 border-border p-4">
                    <div className="flex items-center gap-3">
                      <span className="text-4xl">{def?.emoji ?? "❓"}</span>
                      <div>
                        <p className="font-semibold">{def?.name ?? s.monster_key}</p>
                        <p className={cn("text-xs", meta.color)}>{meta.label}</p>
                      </div>
                    </div>
                    <Button
                      className="rounded-xl"
                      onClick={() => {
                        setCatchTarget(s);
                        setTapCount(0);
                      }}
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

      <p className="text-center text-xs text-foreground/45">
        오늘 포획 {data?.catches_today ?? 0} / {data?.daily_limit ?? 30}
      </p>

      {catchTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <Card className="w-full max-w-sm space-y-4 border-primary/30 p-6 shadow-xl">
            <p className="text-center text-sm text-foreground/60">빠르게 3번 탭하세요!</p>
            <button
              type="button"
              className="mx-auto flex h-36 w-36 flex-col items-center justify-center rounded-full bg-primary/15 text-6xl transition active:scale-95"
              onClick={handleCatchTap}
              disabled={catchMut.isPending}
            >
              {monsterByKey(catchTarget.monster_key)?.emoji ?? "✨"}
              <span className="mt-2 text-base font-semibold text-foreground">
                {tapCount} / 3
              </span>
            </button>
            <Button variant="ghost" className="w-full" onClick={() => setCatchTarget(null)}>
              취소
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
