/**
 * AR 낚시 — 공원 기반 소셜 낚시터.
 *
 * 구성:
 *  - ScenarioCameraShell (카메라 영상)
 *  - FishingArScene (Three.js: 연못, 3D 찌·낚싯대, 그림자, 점프 컷씬)
 *  - useFishingSession (10단계 상태머신)
 *  - FishingHUD (낚시 전용 모바일 HUD — GameHUD 와 분리)
 *
 * 보상은 onReward 콜백 안에서 markStepComplete 로 서버에 기록.
 */

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";
import "@/components/game/FishingArScene.css";
import { FishingHUD } from "@/components/game/GameHUD";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { markStepComplete } from "@/lib/scenario/actions";
import { useGeneratedModel } from "@/lib/asset-forge/useGeneratedModel";
import { resolveRodGlbUrl } from "@/lib/game/fishing-assets";
import { FISH_META, useFishingSession } from "@/lib/game/useFishingSession";
import {
  blueprintFor,
  centerHintText,
  type FishingPhase,
  type GameContext,
  type PrimaryAction,
} from "@/lib/game/action-context";
import { ScenarioCameraShell } from "./ScenarioCameraShell";
import type { ScenarioRunnerProps } from "@/lib/scenario/types";
import type { FishingVisualPhase } from "@/components/game/FishingArScene";

const FishingArScene = lazy(() =>
  import("@/components/game/FishingArScene").then((m) => ({ default: m.FishingArScene })),
);

const SOCIAL_FEED_MOCK = {
  icon: <Users className="h-3.5 w-3.5 shrink-0 text-cyan-300" />,
  text: (
    <>
      민지님이 <span className="font-semibold text-rose-300">붉은 비단잉어</span> 입질 중
    </>
  ),
} as const;

function phaseDisplayLabel(phase: FishingPhase): string {
  switch (phase) {
    case "spot_select":
      return "탐색";
    case "ready":
      return "준비";
    case "casting":
      return "캐스팅";
    case "floating":
      return "비행";
    case "waiting":
      return "대기";
    case "bite":
      return "입질";
    case "fighting":
      return "힘겨루기";
    case "hook_success":
    case "fish_breach":
    case "fish_land":
    case "fish_flop":
    case "capture_confirm":
      return "포획";
    case "escaped":
      return "놓침";
    case "reward":
      return "성공";
    default:
      return "대기";
  }
}

export default function FishingScenario({ onExit, onScenarioComplete }: ScenarioRunnerProps) {
  const generatedFish = useGeneratedModel("fish");
  const generatedRod = useGeneratedModel("generic");
  const [modelDebug, setModelDebug] = useState<{
    fish: "idle" | "loaded" | "failed";
    rod: "idle" | "loading" | "glb" | "procedural" | "failed";
    fishUrl: string | null;
    rodUrl: string | null;
  }>({
    fish: "idle",
    rod: "idle",
    fishUrl: null,
    rodUrl: null,
  });

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
  const debugEnabled =
    (import.meta as { env?: Record<string, string> }).env?.VITE_DEBUG_FISHING === "1";
  const [debugPhase, setDebugPhase] = useState<FishingVisualPhase | null>(null);
  const visualPhase: FishingVisualPhase = debugPhase ?? session.phase;

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

  const primary: PrimaryAction | null = useMemo(() => {
    const bp = blueprint.primary;
    if (!bp) return null;
    const onPressById: Record<string, (() => void) | undefined> = {
      fishing_enter_spot: () => session.enterSpot(),
      fishing_cast_start: () => session.startCasting(),
      fishing_cast_release: () => session.releaseCast(),
      fishing_jiggle: () => session.jiggle(),
      fishing_hook: () => session.hookFish(),
      fishing_reel: () => session.reelHold(),
      fishing_capture_confirm: () => session.captureConfirm(),
      fishing_reward: () => session.retry(),
      fishing_retry: () => session.retry(),
    };
    const onReleaseById: Record<string, (() => void) | undefined> = {
      fishing_cast_start: () => session.releaseCast(),
      fishing_reel: () => session.reelRelease(),
    };
    return {
      label: bp.label,
      sublabel: bp.sublabel,
      icon: <></>,
      tone: bp.tone,
      holdable: bp.holdable,
      pulse: bp.pulse,
      disabled: bp.disabled,
      onPress: onPressById[bp.id],
      onRelease: onReleaseById[bp.id],
    };
  }, [blueprint.primary, session]);

  const centerHint = useMemo(
    () => centerHintText(blueprint.centerHintKey, blueprint.centerHintArgs),
    [blueprint],
  );

  useEffect(() => {
    if (session.phase === "reward") {
      const t = setTimeout(() => {
        onScenarioComplete?.(fishMeta?.xp ?? 10);
      }, 2400);
      return () => clearTimeout(t);
    }
  }, [session.phase, fishMeta?.xp, onScenarioComplete]);

  const phaseLabel = phaseDisplayLabel(session.phase);
  const rareBonus = 12;
  const showSocial =
    session.phase !== "casting" &&
    session.phase !== "floating" &&
    session.phase !== "bite" &&
    session.phase !== "fighting";

  return (
    <ScenarioCameraShell onExit={onExit}>
      <Suspense fallback={null}>
        <FishingArScene
          phase={visualPhase}
          bobberX={session.bobberX}
          bobberY={session.bobberY}
          castPower={session.castPower}
          tension={session.tension}
          fishGlbUrl={generatedFish.glbUrl ?? null}
          rodGlbUrl={resolveRodGlbUrl(generatedRod.glbUrl)}
          fishKey={session.fishKey}
          fishRarity={fishMeta?.rarity ?? "common"}
          showCatch={visualPhase === "capture_confirm"}
          onDebugModelStatus={(s) => setModelDebug(s)}
        />
      </Suspense>

      <FishingHUD
        phase={session.phase}
        primary={primary}
        spotName={session.spotName}
        nearbyPlayers={session.nearbyPlayers}
        rareBonusPercent={rareBonus}
        phaseLabel={phaseLabel}
        centerHint={centerHint}
        socialItem={showSocial ? SOCIAL_FEED_MOCK : null}
        ephemeralMessage={session.message}
        showCastMeter={session.phase === "casting"}
        castPower={session.castPower}
        showBiteFlash={session.phase === "bite"}
        onExit={onExit}
        rewardBanner={
          session.phase === "reward" && fishMeta ? (
            <div className="fishing-hud-reward pointer-events-none">
              <p className="text-xl font-bold text-white drop-shadow-2xl sm:text-2xl">
                {fishMeta.emoji} {fishMeta.name} 포획!
              </p>
              <p className="mt-0.5 text-sm font-semibold text-amber-200 drop-shadow-lg">
                +{fishMeta.xp} XP · +{fishMeta.coins} 코인
              </p>
            </div>
          ) : undefined
        }
      />

      {debugEnabled && (
        <p className="pointer-events-none absolute inset-x-0 bottom-1 z-10 text-center text-[9px] text-white/30">
          {generatedFish.ready || generatedRod.ready
            ? "AI 에셋 적용됨"
            : "기본 3D 낚싯대 · 절차적 연못"}
        </p>
      )}
      {debugEnabled && (
        <div className="pointer-events-none absolute left-2 right-2 bottom-20 z-40 rounded-md bg-black/70 p-2 text-[10px] text-white/90">
          <div>
            fish query:{" "}
            {generatedFish.loading
              ? "loading"
              : generatedFish.ready
                ? "ready"
                : generatedFish.error
                  ? "error"
                  : "idle"}
          </div>
          <div>
            rod query:{" "}
            {generatedRod.loading
              ? "loading"
              : generatedRod.ready
                ? "ready"
                : generatedRod.error
                  ? "error"
                  : "idle"}
          </div>
          <div>
            fish scene: {modelDebug.fish} | rod scene: {modelDebug.rod}
          </div>
          <div className="truncate">
            fish url: {modelDebug.fishUrl ?? generatedFish.glbUrl ?? "-"}
          </div>
          <div className="truncate">rod url: {modelDebug.rodUrl ?? generatedRod.glbUrl ?? "-"}</div>
        </div>
      )}

      <FishingDebugButtons
        session={session}
        debugEnabled={debugEnabled}
        onSelectPhase={(phase) => setDebugPhase(phase)}
      />
    </ScenarioCameraShell>
  );
}

function FishingDebugButtons({
  session,
  debugEnabled,
  onSelectPhase,
}: {
  session: ReturnType<typeof useFishingSession>;
  debugEnabled: boolean;
  onSelectPhase: (phase: FishingVisualPhase) => void;
}) {
  if (!debugEnabled) return null;
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
      {btn("waiting", () => onSelectPhase("waiting"))}
      {btn("bite", () => onSelectPhase("bite"))}
      {btn("hook_success", () => onSelectPhase("hook_success"))}
      {btn("fish_breach", () => onSelectPhase("fish_breach"))}
      {btn("fish_land", () => onSelectPhase("fish_land"))}
      {btn("fish_flop", () => onSelectPhase("fish_flop"))}
      {btn("captured", () => onSelectPhase("capture_confirm"))}
      {btn("escaped", () => onSelectPhase("escaped"))}
      {btn("reward", () => onSelectPhase("reward"))}
      {btn("fighting", () => onSelectPhase("fighting"))}
      {btn("sync", () => onSelectPhase(session.phase))}
    </div>
  );
}
