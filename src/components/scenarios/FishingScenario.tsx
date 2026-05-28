/**
 * AR 낚시 — 공원 기반 소셜 낚시터.
 *
 * 구성:
 *  - ScenarioCameraShell (카메라 영상)
 *  - FishingArScene (Three.js: 가상 연못, 물결, 찌, 물고기 그림자, 점프 컷씬)
 *  - SVG 낚싯대 (좌측 상단 안내 + 우측 하단 본체)
 *  - useFishingSession (10단계 상태머신)
 *  - GameHUD (phase 별 primary/secondary 버튼 자동 매핑)
 *
 * 보상은 onReward 콜백 안에서 markStepComplete 로 서버에 기록.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  Backpack,
  Fish,
  HandMetal,
  LucideRotateCcw,
  Menu,
  Sparkles,
  Target,
  Timer,
  Users,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { markStepComplete } from "@/lib/scenario/actions";
import { useGeneratedModel } from "@/lib/asset-forge/useGeneratedModel";
import { FISH_META, useFishingSession } from "@/lib/game/useFishingSession";
import { blueprintFor, centerHintText, type GameContext, type PrimaryAction, type SecondaryAction } from "@/lib/game/action-context";
import { ScenarioCameraShell } from "./ScenarioCameraShell";
import { GameHUD } from "@/components/game/GameHUD";
import type { ScenarioRunnerProps } from "@/lib/scenario/types";
import { cn } from "@/lib/utils";

const FishingArScene = lazy(() =>
  import("@/components/game/FishingArScene").then((m) => ({ default: m.FishingArScene })),
);

export default function FishingScenario({ onExit, onScenarioComplete }: ScenarioRunnerProps) {
  const generatedFish = useGeneratedModel("fish");

  const stepMut = useMutation({
    mutationFn: async (step_key: string) =>
      markStepComplete({
        data: { scenario_id: "fishing", step_key },
        headers: await authHeaders(),
      } as Parameters<typeof markStepComplete>[0]),
  });

  const session = useFishingSession({
    onReward: ({ fish, success }) => {
      if (success) {
        toast.success(`${fish.emoji} ${fish.name} +${fish.xp} XP / +${fish.coins} 코인`);
        stepMut.mutate("catch_one");
      } else {
        toast.info("다음엔 더 잘할 수 있어요");
      }
    },
  });

  const fishMeta = session.fishKey ? FISH_META[session.fishKey] : null;

  // GameContext 빌드 — blueprint 가 phase 별 액션 만듦
  const context: GameContext = useMemo(
    () => ({
      kind: "fishing",
      phase: session.phase,
      spotName: session.spotName,
      nearbyPlayers: session.nearbyPlayers,
      castPower: session.castPower,
      tension: session.tension,
      fishName: fishMeta?.name,
    }),
    [
      session.phase,
      session.spotName,
      session.nearbyPlayers,
      session.castPower,
      session.tension,
      fishMeta?.name,
    ],
  );

  const blueprint = useMemo(() => blueprintFor(context), [context]);

  // ── PrimaryAction 매핑 ──────────────────────────────────────
  const primary: PrimaryAction | null = useMemo(() => {
    const bp = blueprint.primary;
    if (!bp) return null;
    const iconMap: Record<string, React.ReactNode> = {
      fishing_enter_spot: <ArrowRight className="h-5 w-5" />,
      fishing_cast_start: <Target className="h-5 w-5" />,
      fishing_cast_release: <Sparkles className="h-5 w-5" />,
      fishing_jiggle: <HandMetal className="h-5 w-5" />,
      fishing_hook: <Fish className="h-6 w-6" />,
      fishing_reel: <LucideRotateCcw className="h-5 w-5" />,
      fishing_reward: <Sparkles className="h-6 w-6" />,
      fishing_retry: <LucideRotateCcw className="h-5 w-5" />,
    };
    const onPressById: Record<string, (() => void) | undefined> = {
      fishing_enter_spot: () => session.enterSpot(),
      fishing_cast_start: () => session.startCasting(),
      fishing_cast_release: () => session.releaseCast(),
      fishing_jiggle: () => session.jiggle(),
      fishing_hook: () => session.hookFish(),
      fishing_reel: () => session.reelHold(),
      fishing_reward: () => session.retry(),
      fishing_retry: () => session.retry(),
    };
    const onReleaseById: Record<string, (() => void) | undefined> = {
      // 캐스팅 충전은 hold-release 패턴
      fishing_cast_start: () => session.releaseCast(),
      fishing_reel: () => session.reelRelease(),
    };
    return {
      label: bp.label,
      sublabel: bp.sublabel,
      icon: iconMap[bp.id] ?? <Sparkles className="h-5 w-5" />,
      tone: bp.tone,
      holdable: bp.holdable,
      pulse: bp.pulse,
      disabled: bp.disabled,
      onPress: onPressById[bp.id],
      onRelease: onReleaseById[bp.id],
    };
  }, [blueprint.primary, session]);

  // ── SecondaryAction 매핑 ────────────────────────────────────
  const secondaries: SecondaryAction[] = useMemo(() => {
    const items: SecondaryAction[] = [];
    for (const id of blueprint.secondaryIds) {
      switch (id) {
        case "menu":
          items.push({
            id,
            label: "메뉴",
            icon: <Menu className="h-4 w-4" />,
            onPress: () => toast.info("메뉴 (추후)"),
          });
          break;
        case "fishing_bait":
          items.push({
            id,
            label: "미끼",
            icon: <Sparkles className="h-4 w-4" />,
            onPress: () => toast.info("미끼 변경 (추후)"),
          });
          break;
        case "fishing_rod":
          items.push({
            id,
            label: "낚싯대",
            icon: <Fish className="h-4 w-4" />,
            onPress: () => toast.info("낚싯대 변경 (추후)"),
          });
          break;
        case "fishing_loosen":
          items.push({
            id,
            label: "느슨",
            icon: <span className="text-xs font-bold">−</span>,
            onPress: () => session.loosen(),
          });
          break;
        case "fishing_tighten":
          items.push({
            id,
            label: "조임",
            icon: <span className="text-xs font-bold">+</span>,
            onPress: () => session.tighten(),
          });
          break;
        case "fishing_exit":
          items.push({
            id,
            label: "나가기",
            icon: <X className="h-4 w-4" />,
            onPress: () => onExit(),
          });
          break;
        default:
          break;
      }
    }
    return items;
  }, [blueprint.secondaryIds, session, onExit]);

  const centerHint = useMemo(
    () => centerHintText(blueprint.centerHintKey, blueprint.centerHintArgs),
    [blueprint],
  );

  // ── 환경 메시지 (도착, 도망 등) ──────────────────────────────
  const ephemeralMessage = session.message;

  // reward phase 진입 후 일정 시간 뒤 시나리오 완료 처리
  useEffect(() => {
    if (session.phase === "caught") {
      const t = setTimeout(() => {
        // caught → reward 자동 전환 + 외부 시나리오 complete
        onScenarioComplete?.(fishMeta?.xp ?? 10);
      }, 2400);
      return () => clearTimeout(t);
    }
  }, [session.phase, fishMeta?.xp, onScenarioComplete]);

  // 표시용 데이터
  const biteWindowMax = 1500;

  return (
    <ScenarioCameraShell onExit={onExit}>
      {/* 카메라 위에 가상 연못 + 효과 */}
      <Suspense fallback={null}>
        <FishingArScene
          phase={session.phase}
          bobberX={session.bobberX}
          bobberY={session.bobberY}
          fishGlbUrl={generatedFish.glbUrl ?? null}
          fishRarity={fishMeta?.rarity ?? "common"}
          showCatch={session.phase === "caught"}
        />
      </Suspense>

      {/* SVG 낚싯대 — 우측 하단 (고정 시각 요소) */}
      <svg
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <path
          d={`M 88 98 Q ${
            session.phase === "casting"
              ? 92
              : session.phase === "fighting"
                ? 82
                : 85
          } ${session.phase === "fighting" ? 65 : 70} 78 ${
            session.phase === "casting" ? 64 : 56
          }`}
          stroke="#7c4a1e"
          strokeWidth={0.7}
          strokeLinecap="round"
          fill="none"
        />
        <circle cx={78} cy={56} r={0.45} fill="#fbbf24" />
        {/* 낚싯대 끝에서 찌까지 줄 */}
        {(session.phase === "floating" ||
          session.phase === "waiting" ||
          session.phase === "bite" ||
          session.phase === "fighting") && (
          <path
            d={`M 78 56 Q ${(78 + session.bobberX * 100) / 2} ${
              (56 + session.bobberY * 100) / 2 - 6
            } ${session.bobberX * 100} ${session.bobberY * 100}`}
            stroke="rgba(255,255,255,0.7)"
            strokeWidth={0.2}
            fill="none"
          />
        )}
      </svg>

      {/* 상단 상태 카드 */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-30 mx-auto max-w-md">
        <Card className="border-blue-400/40 bg-sky-950/85 p-3 text-white shadow-lg backdrop-blur-md">
          <header className="flex items-center gap-2">
            <Fish className="h-5 w-5 text-sky-300" />
            <div className="leading-tight">
              <h2 className="font-display text-base">{session.spotName}</h2>
              <p className="text-[11px] opacity-80">
                <Users className="mr-0.5 inline h-3 w-3" />
                같이 낚시 중 {session.nearbyPlayers}명
              </p>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="ml-auto text-xs underline opacity-80"
            >
              나가기
            </button>
          </header>

          {/* phase 별 미니 게이지 */}
          {session.phase === "casting" && (
            <div className="mt-2 space-y-0.5">
              <p className="text-[10px] opacity-80">힘 {Math.round(session.castPower * 100)}%</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-sky-300 via-amber-300 to-rose-400"
                  style={{ width: `${session.castPower * 100}%` }}
                />
              </div>
            </div>
          )}

          {session.phase === "bite" && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <Timer className="h-3.5 w-3.5" />
                <span>{(session.biteRemainingMs / 1000).toFixed(1)}s</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/30">
                  <div
                    className="h-full bg-amber-300"
                    style={{
                      width: `${Math.max(0, (session.biteRemainingMs / biteWindowMax) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <p className="animate-pulse text-center text-[11px] font-semibold text-amber-200">
                지금 당기세요!
              </p>
            </div>
          )}

          {session.phase === "fighting" && (
            <FightingGauges tension={session.tension} fishHp={session.fishHp} />
          )}
        </Card>
      </div>

      {/* ephemeral 메시지 */}
      {ephemeralMessage && (
        <div className="pointer-events-none absolute left-0 right-0 top-28 z-20 flex justify-center">
          <div className="animate-pulse rounded-full bg-black/60 px-4 py-1.5 text-xs text-white">
            {ephemeralMessage}
          </div>
        </div>
      )}

      {/* 잡힘 — 결과 라벨 (큰 컷씬은 Three.js 안에서 처리) */}
      {session.phase === "caught" && fishMeta && (
        <div
          className={cn(
            "pointer-events-none absolute left-0 right-0 top-[55%] z-30 text-center",
          )}
        >
          <p className="text-3xl font-bold text-white drop-shadow-2xl">
            {fishMeta.emoji} {fishMeta.name} 포획!
          </p>
          <p className="mt-1 text-base font-semibold text-amber-200 drop-shadow-lg">
            +{fishMeta.xp} XP · +{fishMeta.coins} 코인
          </p>
        </div>
      )}

      {/* GameHUD (좌측 primary stick + 우측 secondary stack) */}
      <GameHUD
        primary={primary}
        secondaries={secondaries}
        centerHint={centerHint}
        topRight={
          <button
            type="button"
            onClick={() => session.retry()}
            className="flex h-9 items-center gap-1 rounded-full bg-black/55 px-3 text-xs text-white backdrop-blur-sm active:scale-95"
          >
            <Backpack className="h-3.5 w-3.5" />
            <span>{session.phase}</span>
          </button>
        }
      />

      <p className="pointer-events-none absolute bottom-2 left-0 right-0 z-10 text-center text-[10px] text-white/45">
        {generatedFish.ready
          ? "🐟 AI 생성 물고기 모델 적용됨"
          : "* AI 생성 물고기는 admin/asset-forge 에서 만들면 자동 적용"}
      </p>

      {/* Dev 디버그 — VITE_DEBUG_FISHING=1 일 때만 phase 강제 전환 버튼 노출 */}
      <FishingDebugButtons session={session} />
    </ScenarioCameraShell>
  );
}

function FishingDebugButtons({
  session,
}: {
  session: ReturnType<typeof useFishingSession>;
}) {
  const enabled = (import.meta as { env?: Record<string, string> }).env?.VITE_DEBUG_FISHING === "1";
  if (!enabled) return null;
  const btn = (label: string, onPress: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onPress}
      className="rounded-md bg-fuchsia-600/85 px-2 py-1 text-[10px] font-bold text-white shadow active:scale-95"
    >
      {label}
    </button>
  );
  return (
    <div className="pointer-events-auto absolute right-2 top-24 z-40 flex flex-col gap-1">
      <p className="text-[9px] text-white/70">DEV</p>
      {btn("ready", () => session.reset())}
      {btn("→ casting", () => session.startCasting())}
      {btn("→ floating", () => {
        session.startCasting();
        setTimeout(() => session.releaseCast(), 50);
      })}
      {btn("bite!", () => {
        // 강제로 bite 트리거 — startCasting + release 후 즉시 jiggle 반복
        session.startCasting();
        setTimeout(() => session.releaseCast(), 30);
        setTimeout(() => {
          for (let i = 0; i < 3; i++) setTimeout(() => session.jiggle(), i * 80);
        }, 700);
      })}
      {btn("hook → fight", () => session.hookFish())}
      {btn("force tighten", () => session.tighten())}
      {btn("force loosen", () => session.loosen())}
    </div>
  );
}

function FightingGauges({ tension, fishHp }: { tension: number; fishHp: number }) {
  // 텐션 0.35~0.7 이 안전 zone (초록), 밖이면 빨강
  const safe = tension >= 0.35 && tension <= 0.7;
  return (
    <div className="mt-2 space-y-1.5">
      <div>
        <p className="mb-0.5 text-[10px] opacity-80">텐션 (초록 구간 유지)</p>
        <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
          {/* 안전 zone 표시 */}
          <div
            className="absolute h-full bg-emerald-400/35"
            style={{ left: "35%", width: "35%" }}
          />
          <div
            className={cn(
              "h-full transition-all",
              safe ? "bg-emerald-400" : "bg-rose-500",
            )}
            style={{ width: `${tension * 100}%` }}
          />
        </div>
      </div>
      <div>
        <p className="mb-0.5 text-[10px] opacity-80">물고기 체력</p>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-sky-300"
            style={{ width: `${fishHp * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
