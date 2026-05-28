/**
 * Camera-first AR walking session.
 *
 * 사용자가 "시작하기" 를 누르는 즉시 카메라가 켜지고, 산책 + 포획이 카메라 안에서
 * 끝나는 풀스크린 경험. 기존 카드 스크롤 UI 는 햄버거 → bottom sheet (메뉴) 로 이동.
 *
 * 책임:
 *  - 카메라 스트림 lifecycle (HTTPS 권한 거부 등 에러 핸들)
 *  - GPS watchPosition lifecycle (auto-start)
 *  - 3D AR scene 은 "근접 in_range 스폰" 이 있을 때만 합성. 평시에는 카메라 + HUD 만.
 *  - 포획: 3D scene 의 raycaster hit + 모드(aim/tap/rhythm) 에 따라 hits 증가.
 *    hitsRequired 도달 시 catch mutation.
 *  - 메뉴 sheet 안에 inventory / leaderboard / radar / 통계 UI 노출.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Crosshair,
  Hand,
  Loader2,
  MapPin,
  Menu,
  Music,
  Package,
  RotateCw,
  Search,
  Sparkles,
  Sword,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { bearingDeg, bearingDelta, CATCH_RADIUS_M, haversineM } from "@/lib/game/geo";
import { monsterByKey, RARITY_META, type MonsterRarity } from "@/lib/game/monsters";
import { pickBestAnchor, useObjectDetector } from "@/lib/ar/useObjectDetector";
import { useGeneratedModel } from "@/lib/asset-forge/useGeneratedModel";
import {
  blueprintFor,
  centerHintText,
  type GameContext,
  type PrimaryAction,
  type SecondaryAction,
} from "@/lib/game/action-context";
import { cn } from "@/lib/utils";
import { SpawnRadarMap } from "@/components/game/SpawnRadarMap";
import { GameInventoryPanel } from "@/components/game/GameInventoryPanel";
import { GameLeaderboard } from "@/components/game/GameLeaderboard";
import { GameHUD } from "@/components/game/GameHUD";

const MonsterArScene = lazy(() =>
  import("@/components/game/MonsterArScene").then((m) => ({ default: m.MonsterArScene })),
);

type CaptureMode = "aim" | "tap" | "rhythm";

export type ArSpawn = {
  id: string;
  monster_key: string;
  rarity: MonsterRarity;
  latitude: number;
  longitude: number;
  distance_m: number | null;
  in_range: boolean;
};

interface InvRow {
  item_key: string;
  quantity: number;
}

interface Props {
  profile: {
    level: number;
    xp: number;
    coins: number;
    total_catches: number;
    session_distance_m: number;
    spawn_progress_m: number;
    spawn_threshold_m: number;
    catch_radius_m: number;
  };
  spawns: ArSpawn[];
  inventory: InvRow[];
  catchesToday: number;
  dailyLimit: number;
  userPos: { lat: number; lng: number } | null;

  isTracking: boolean;
  isCatching: boolean;
  isSpawning?: boolean;
  onStartTracking: () => void;
  onStopTracking: () => void;
  onResetSession: () => void;
  onRefreshPosition: () => void;
  onCatch: (spawn: ArSpawn, useOrb: boolean) => void;
  onExit: () => void;
  onForceSpawn?: () => void;
}

const RHYTHM_INTERVAL_MS = 850;
const RHYTHM_WINDOW_MS = 220;

function pickDefaultMode(rarity: MonsterRarity | undefined): CaptureMode {
  if (rarity === "legendary") return "rhythm";
  return "aim";
}

function cameraErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return "카메라 권한을 허용해 주세요. 브라우저 설정 → 사이트 권한에서 변경할 수 있어요.";
    }
    if (err.name === "NotFoundError") return "카메라를 찾을 수 없어요.";
    if (err.name === "NotReadableError") {
      return "카메라가 다른 앱에서 사용 중일 수 있어요. 앱을 닫고 다시 시도해 주세요.";
    }
  }
  return "카메라를 켤 수 없어요. HTTPS 연결과 권한을 확인해 주세요.";
}

export function ARWalkSession(props: Props) {
  const {
    profile,
    spawns,
    inventory,
    catchesToday,
    dailyLimit,
    userPos,
    isTracking,
    isCatching,
    isSpawning,
    onStartTracking,
    onStopTracking,
    onResetSession,
    onRefreshPosition,
    onCatch,
    onExit,
    onForceSpawn,
  } = props;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camStatus, setCamStatus] = useState<"loading" | "ready" | "error">("loading");
  const [camError, setCamError] = useState("");

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSpawnId, setActiveSpawnId] = useState<string | null>(null);
  const [hits, setHits] = useState(0);
  const [mode, setMode] = useState<CaptureMode>("aim");

  // ── 카메라 lifecycle ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const stop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamStatus("error");
        setCamError("이 브라우저는 카메라를 지원하지 않아요.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => null);
        }
        setCamStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setCamStatus("error");
          setCamError(cameraErrorMessage(err));
        }
      }
    }
    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  // ── GPS tracking auto-start on mount ─────────────────────────
  // 부모가 외부에서 isTracking 을 관리하지만, 이 컴포넌트가 열리는 순간 자동 시작.
  useEffect(() => {
    if (!isTracking) onStartTracking();
    // unmount 시 부모가 알아서 stop 호출 (페이지 나갈 때).
    // 여기서 stop 호출은 다시 켜질 때 race 가 생겨 의도적으로 안 함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 디바이스 기울기 + 나침반 ──────────────────────────────────
  const { offset, heading, needsPermission, requestPermission } = useDeviceOrientation(
    camStatus === "ready",
  );

  // 나침반 raw → 부드러운 보간 (튀는 값 억제). 360° 경계도 처리.
  const smoothedHeadingRef = useRef<number | null>(null);
  useEffect(() => {
    if (heading == null) return;
    let raf = 0;
    const tick = () => {
      const cur = smoothedHeadingRef.current;
      if (cur == null) {
        smoothedHeadingRef.current = heading;
      } else {
        let delta = heading - cur;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        smoothedHeadingRef.current = (cur + delta * 0.18 + 360) % 360;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [heading]);

  // ── 활성 spawn (in_range 가 우선, 없으면 가장 가까운 것) ─────
  const activeSpawn = useMemo(() => {
    if (activeSpawnId) {
      const found = spawns.find((s) => s.id === activeSpawnId);
      if (found) return found;
    }
    const inRange = spawns.filter((s) => s.in_range);
    if (inRange.length > 0) {
      return inRange.reduce((best, s) =>
        (s.distance_m ?? Infinity) < (best.distance_m ?? Infinity) ? s : best,
      );
    }
    return null;
  }, [spawns, activeSpawnId]);

  // ── 활성 spawn 방향 vs 현재 폰 방향 (UI 안내용) ──────────────
  const aimDelta = useMemo(() => {
    if (!activeSpawn || !userPos || smoothedHeadingRef.current == null) return null;
    const monsterBearing = bearingDeg(
      userPos.lat,
      userPos.lng,
      activeSpawn.latitude,
      activeSpawn.longitude,
    );
    return bearingDelta(smoothedHeadingRef.current, monsterBearing);
  }, [activeSpawn?.id, activeSpawn?.latitude, activeSpawn?.longitude, userPos, heading]);

  // 발견 상태 표시용. (실제 hit 판정은 씬 내부 aimScore 가 결정)
  const isAimed = aimDelta != null && Math.abs(aimDelta) <= 18;

  // AI 생성 몬스터 GLB (asset-forge active=true 일 때만 로드).
  const generatedMonster = useGeneratedModel("monster");

  // ── 객체 인식 (Phase 1: 발견 상태에서만 동작, 보조 anchoring) ──
  // 카메라가 ready 이고 활성 spawn 이 발견 상태일 때만 검출 워커 활성화.
  // 검출 실패/지원안함은 silent — 게임 핵심 흐름과 분리.
  const detectorEnabled = camStatus === "ready" && !!activeSpawn && isAimed;
  const objectDetector = useObjectDetector({
    enabled: detectorEnabled,
    video: videoRef.current,
  });

  // 600ms 마다 한 번씩 검출 요청.
  useEffect(() => {
    if (!detectorEnabled || !objectDetector.ready) return;
    objectDetector.requestDetection(); // 즉시 한 번
    const id = setInterval(() => objectDetector.requestDetection(), 600);
    return () => clearInterval(id);
  }, [detectorEnabled, objectDetector.ready, objectDetector.requestDetection]);

  // 최신 검출 결과에서 가장 적절한 anchor 픽.
  const screenAnchor = useMemo(() => {
    if (!detectorEnabled) return null;
    const v = videoRef.current;
    if (!v || v.videoWidth === 0 || v.videoHeight === 0) return null;
    const dets = objectDetector.latest;
    if (!dets || dets.length === 0) return null;
    const best = pickBestAnchor(dets, v.videoWidth, v.videoHeight);
    if (!best) return null;
    return {
      x: (best.x + best.width / 2) / v.videoWidth,
      y: (best.y + best.height / 2) / v.videoHeight,
      size: best.height / v.videoHeight,
      category: best.category,
    };
  }, [detectorEnabled, objectDetector.latest]);

  // active spawn 바뀌면 hits 초기화 + 기본 모드 재설정.
  useEffect(() => {
    setHits(0);
    if (activeSpawn) setMode(pickDefaultMode(activeSpawn.rarity));
  }, [activeSpawn?.id, activeSpawn?.rarity]);

  // ── 가장 가까운 미in_range 스폰 (안내용) ─────────────────────
  const closestApproach = useMemo(() => {
    if (!userPos) return null;
    const outOfRange = spawns.filter((s) => !s.in_range);
    if (outOfRange.length === 0) return null;
    return outOfRange.reduce((best, s) =>
      (s.distance_m ?? Infinity) < (best.distance_m ?? Infinity) ? s : best,
    );
  }, [spawns, userPos]);

  // ── Rhythm 비트 ──────────────────────────────────────────────
  const beatRef = useRef({ lastBeatAt: 0, nextBeatAt: 0 });
  const [beatPulse, setBeatPulse] = useState(0);
  useEffect(() => {
    if (mode !== "rhythm" || camStatus !== "ready" || !activeSpawn) return;
    const start = performance.now();
    beatRef.current.lastBeatAt = start;
    beatRef.current.nextBeatAt = start + RHYTHM_INTERVAL_MS;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      if (now >= beatRef.current.nextBeatAt) {
        beatRef.current.lastBeatAt = now;
        beatRef.current.nextBeatAt = now + RHYTHM_INTERVAL_MS;
        setBeatPulse((n) => n + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, camStatus, activeSpawn?.id]);

  // ── 명중 처리 ────────────────────────────────────────────────
  const orbQty = inventory.find((i) => i.item_key === "capture_orb")?.quantity ?? 0;
  const useOrb = orbQty > 0;
  const hitsRequired = useOrb ? 2 : 3;

  const handleAim = useCallback(
    (hit: boolean) => {
      if (!activeSpawn || isCatching) return;
      let counted = false;
      if (mode === "aim") {
        counted = hit;
      } else if (mode === "tap") {
        counted = true;
      } else if (mode === "rhythm") {
        const now = performance.now();
        const closestBeat =
          Math.abs(now - beatRef.current.lastBeatAt) < Math.abs(now - beatRef.current.nextBeatAt)
            ? beatRef.current.lastBeatAt
            : beatRef.current.nextBeatAt;
        const inWindow = Math.abs(now - closestBeat) <= RHYTHM_WINDOW_MS;
        counted = inWindow && hit;
      }
      if (!counted) return;

      setHits((prev) => {
        const next = prev + 1;
        if (next >= hitsRequired) {
          // 부모 mutation → onCatch 안에서 success/fail 핸들.
          onCatch(activeSpawn, useOrb);
          return 0;
        }
        return next;
      });
    },
    [activeSpawn, isCatching, mode, hitsRequired, useOrb, onCatch],
  );

  // ── Render ───────────────────────────────────────────────────
  const def = activeSpawn ? monsterByKey(activeSpawn.monster_key) : null;
  const meta = activeSpawn ? RARITY_META[activeSpawn.rarity] : null;
  const progressPct = profile
    ? Math.min(100, (profile.spawn_progress_m / profile.spawn_threshold_m) * 100)
    : 0;

  // ── 현재 컨텍스트 결정 ─────────────────────────────────────
  // 향후 fishing/pet/coop 모드 추가 시 이 함수만 확장하면 HUD 가 자동으로 바뀐다.
  const gameContext: GameContext = useMemo(() => {
    if (!activeSpawn) return { kind: "walking" };
    if (!isAimed) {
      const dir: "left" | "right" | "center" =
        aimDelta == null
          ? "center"
          : aimDelta < -3
            ? "left"
            : aimDelta > 3
              ? "right"
              : "center";
      return { kind: "hiding", monster: activeSpawn, direction: dir };
    }
    return { kind: "aimed", monster: activeSpawn, captureMode: mode };
  }, [activeSpawn?.id, isAimed, aimDelta, mode]);

  // ── 액션 매핑 ─────────────────────────────────────────────────
  // blueprint 의 ActionId → 실제 React handler + 아이콘으로 변환.
  const blueprint = useMemo(() => blueprintFor(gameContext), [gameContext]);

  const cycleMode = useCallback(() => {
    setMode((m) => (m === "aim" ? "tap" : m === "tap" ? (activeSpawn?.rarity === "legendary" ? "rhythm" : "aim") : "aim"));
  }, [activeSpawn?.rarity]);

  const primary: PrimaryAction | null = useMemo(() => {
    if (!blueprint.primary) return null;
    const id = blueprint.primary.id;
    let handler: (() => void) | undefined;
    let icon: React.ReactNode = <Sparkles className="h-5 w-5" />;
    if (id === "force_spawn") {
      handler = () => onForceSpawn?.();
      icon = <Search className="h-5 w-5" />;
    } else if (id === "attack") {
      handler = () => {
        if (isCatching) return;
        // aim 모드: raycaster 가 hit 판정. 사용자가 몬스터를 화면 정중앙에
        // 두고 있다고 가정해 (0.5,0.5) 좌표로 trigger.
        // tap/rhythm: 항상 true.
        handleAim(true);
      };
      icon = <Sword className="h-6 w-6" />;
    }
    return {
      label: blueprint.primary.label,
      sublabel: blueprint.primary.sublabel,
      icon,
      onPress: handler,
      tone: blueprint.primary.tone,
      holdable: blueprint.primary.holdable,
      pulse: blueprint.primary.pulse,
      disabled:
        (id === "force_spawn" && (!!isSpawning || !userPos)) ||
        (id === "attack" && isCatching),
    };
  }, [blueprint, isCatching, isSpawning, userPos, handleAim, onForceSpawn]);

  const secondaries: SecondaryAction[] = useMemo(() => {
    const items: SecondaryAction[] = [];
    for (const id of blueprint.secondaryIds) {
      switch (id) {
        case "menu":
          items.push({
            id,
            label: "메뉴",
            icon: <Menu className="h-4 w-4" />,
            onPress: () => setMenuOpen(true),
          });
          break;
        case "mode":
          items.push({
            id,
            label: mode === "aim" ? "조준" : mode === "tap" ? "연타" : "리듬",
            icon:
              mode === "aim" ? (
                <Crosshair className="h-4 w-4" />
              ) : mode === "tap" ? (
                <Hand className="h-4 w-4" />
              ) : (
                <Music className="h-4 w-4" />
              ),
            onPress: cycleMode,
            active: true,
          });
          break;
        case "inventory":
          items.push({
            id,
            label: "가방",
            icon: <Package className="h-4 w-4" />,
            onPress: () => setMenuOpen(true),
            badge: inventory.reduce((sum, i) => sum + i.quantity, 0) || undefined,
          });
          break;
        case "refresh_position":
          items.push({
            id,
            label: "위치",
            icon: <MapPin className="h-4 w-4" />,
            onPress: onRefreshPosition,
          });
          break;
        case "exit":
          items.push({
            id,
            label: "나가기",
            icon: <X className="h-4 w-4" />,
            onPress: onExit,
          });
          break;
        default:
          // 미래 모드 (fishing_*, pet_*, coop_*) — 핸들러는 그 모드 도입 시 wiring
          break;
      }
    }
    return items;
  }, [blueprint, mode, inventory, cycleMode, onRefreshPosition, onExit]);

  const centerHint = useMemo(() => centerHintText(blueprint.centerHintKey, blueprint.centerHintArgs), [blueprint]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black">
      {/* 카메라 비디오 */}
      <video
        ref={videoRef}
        className={cn(
          "absolute inset-0 h-full w-full object-cover",
          camStatus !== "ready" && "opacity-0",
        )}
        playsInline
        muted
        autoPlay
        aria-hidden
      />

      {camStatus === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
          <Loader2 className="h-10 w-10 animate-spin" />
          <p className="text-sm">카메라 켜는 중…</p>
          <p className="text-[11px] text-white/60">권한 요청 창이 나오면 "허용" 해주세요</p>
        </div>
      )}

      {camStatus === "error" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-zinc-900 px-6 text-center text-white">
          <p className="text-fluid-sm leading-relaxed">{camError}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              다시 시도
            </Button>
            <Button variant="outline" onClick={onExit}>
              나가기
            </Button>
          </div>
        </div>
      )}

      {camStatus === "ready" && (
        <>
          {/* 배경 어둠 gradient — 상하만 살짝 어둡게 (HUD 가독성) */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/55" />

          {/* 3D AR scene */}
          {activeSpawn && userPos && (
            <Suspense fallback={null}>
              <MonsterArScene
                monsterKey={activeSpawn.monster_key}
                rarity={activeSpawn.rarity}
                hits={hits}
                hitsRequired={hitsRequired}
                orientation={offset}
                onAim={handleAim}
                monsterName={def?.name}
                bearingDeg={bearingDeg(
                  userPos.lat,
                  userPos.lng,
                  activeSpawn.latitude,
                  activeSpawn.longitude,
                )}
                distanceM={
                  activeSpawn.distance_m ??
                  haversineM(userPos.lat, userPos.lng, activeSpawn.latitude, activeSpawn.longitude)
                }
                compassHeading={smoothedHeadingRef.current}
                screenAnchor={
                  screenAnchor
                    ? { x: screenAnchor.x, y: screenAnchor.y, size: screenAnchor.size }
                    : null
                }
                glbUrl={generatedMonster.glbUrl ?? null}
              />
            </Suspense>
          )}

          {/* 활성 spawn 라벨 + HP 바 (몬스터 위 작게) */}
          {activeSpawn && def && meta && isAimed && (
            <div className="pointer-events-none absolute left-0 right-0 top-20 z-10 flex flex-col items-center px-4 text-center">
              <p className="text-base font-semibold text-white drop-shadow-md">
                {def.name}
              </p>
              <div className="mt-1.5 h-2 w-40 overflow-hidden rounded-full bg-black/40">
                <div
                  className={cn(
                    "h-full transition-all duration-200",
                    activeSpawn.rarity === "legendary"
                      ? "bg-amber-300"
                      : activeSpawn.rarity === "rare"
                        ? "bg-blue-400"
                        : "bg-emerald-400",
                  )}
                  style={{ width: `${Math.max(0, 100 - (hits / hitsRequired) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* 시야 밖 몬스터 방향 화살표 — 사이드 가장자리에만 */}
          {userPos &&
            smoothedHeadingRef.current != null &&
            spawns
              .filter((s) => s.id !== activeSpawn?.id)
              .slice(0, 4)
              .map((s) => {
                const bearing = bearingDeg(userPos.lat, userPos.lng, s.latitude, s.longitude);
                const delta = bearingDelta(smoothedHeadingRef.current!, bearing);
                if (Math.abs(delta) < 30) return null;
                const isLeft = delta < 0;
                const monsterDef = monsterByKey(s.monster_key);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "pointer-events-none absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs text-white backdrop-blur-sm",
                      isLeft ? "left-2" : "right-2",
                    )}
                  >
                    {isLeft ? "←" : null}
                    <span>{monsterDef?.emoji ?? "?"}</span>
                    <span className="text-[10px] text-white/75">{s.distance_m ?? "?"}m</span>
                    {!isLeft ? "→" : null}
                  </div>
                );
              })}

          {/* 객체 인식 anchor 배지 */}
          {activeSpawn && isAimed && screenAnchor && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/85 px-2 py-0.5 text-[10px] font-medium text-white shadow"
              style={{
                left: `${screenAnchor.x * 100}%`,
                top: `${(screenAnchor.y + screenAnchor.size / 2 + 0.05) * 100}%`,
              }}
            >
              {koreanCategoryName(screenAnchor.category)} 위
            </div>
          )}

          {/* 조준 십자선 — 발견 + aim 모드 한정 */}
          {activeSpawn && mode === "aim" && isAimed && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
              <div className="relative h-16 w-16">
                <div className="absolute inset-0 animate-pulse rounded-full border-2 border-white/80" />
                <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/40" />
                <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/40" />
              </div>
            </div>
          )}

          {/* Rhythm 비트 표시 */}
          {activeSpawn && mode === "rhythm" && isAimed && (
            <div className="pointer-events-none absolute bottom-[40%] left-1/2 z-10 -translate-x-1/2">
              <div
                key={beatPulse}
                className="h-3 w-24 origin-center animate-ping rounded-full bg-amber-300/80"
              />
            </div>
          )}

          {/* 디바이스 방향 권한 안내 */}
          {needsPermission && (
            <div className="absolute left-3 right-3 top-20 z-20">
              <Button
                type="button"
                variant="secondary"
                className="w-full gap-2"
                onClick={() => void requestPermission()}
              >
                AR 움직임 허용 (기울기 센서)
              </Button>
            </div>
          )}

          {/* 상단 진행 바 — session distance / 다음 스폰까지 */}
          <div className="pointer-events-none absolute left-3 right-3 top-12 z-10 mx-auto max-w-xs">
            <div className="flex items-center justify-between text-[10px] text-white/80">
              <span>{profile.session_distance_m}m</span>
              <span>다음 스폰 {profile.spawn_progress_m}/{profile.spawn_threshold_m}m</span>
              <span>오늘 {catchesToday}/{dailyLimit}</span>
            </div>
            <Progress value={progressPct} className="mt-1 h-1.5 bg-white/15" />
          </div>

          {/* ── 게임패드 HUD ── */}
          <GameHUD
            primary={primary}
            secondaries={secondaries}
            centerHint={centerHint}
            topLeft={
              <div className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
                <span className="font-semibold">Lv.{profile.level}</span>
                <span className="text-white/55">·</span>
                <span>{profile.xp} XP</span>
                <span className="text-white/55">·</span>
                <span>🪙 {profile.coins}</span>
              </div>
            }
            topRight={
              <>
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:scale-95"
                  aria-label="메뉴"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:scale-95"
                  aria-label="나가기"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            }
          />
        </>
      )}

      {/* 메뉴 sheet */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>산책 메뉴</SheetTitle>
            <SheetDescription className="text-xs">
              가방·랭킹·레이더를 한곳에서 확인하세요.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-border/60 p-4">
              <h3 className="mb-2 text-center text-sm font-medium text-foreground/70">레이더</h3>
              <SpawnRadarMap
                userLat={userPos?.lat ?? null}
                userLng={userPos?.lng ?? null}
                spawns={spawns}
                catchRadiusM={profile.catch_radius_m}
              />
            </div>
            <GameInventoryPanel inventory={inventory} coins={profile.coins} />
            <GameLeaderboard />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={onRefreshPosition}>
                <MapPin className="mr-1 h-4 w-4" />
                위치 갱신
              </Button>
              <Button variant="outline" onClick={onResetSession}>
                <RotateCw className="mr-1 h-4 w-4" />
                거리 초기화
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function modeLabel(m: CaptureMode): string {
  return m === "aim" ? "조준 모드" : m === "tap" ? "연타 모드" : "리듬 모드";
}

// MediaPipe COCO 영문 카테고리 → 한국어 라벨. 누락된 건 그냥 영문 그대로 노출.
const CATEGORY_KO: Record<string, string> = {
  chair: "의자",
  bench: "벤치",
  couch: "소파",
  sofa: "소파",
  backpack: "가방",
  handbag: "핸드백",
  suitcase: "캐리어",
  "potted plant": "화분",
  "dining table": "테이블",
  bicycle: "자전거",
  "fire hydrant": "소화전",
  bottle: "병",
  cup: "컵",
  book: "책",
  laptop: "노트북",
  keyboard: "키보드",
  car: "자동차",
  truck: "트럭",
  bus: "버스",
  "traffic light": "신호등",
  "stop sign": "표지판",
};
function koreanCategoryName(cat: string): string {
  return CATEGORY_KO[cat] ?? cat;
}

function ModeChip({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-white/20 bg-white/5 text-white/85 hover:bg-white/15",
        disabled && "opacity-40",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
