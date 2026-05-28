/**
 * AR 낚시 — end-to-end 게임 시나리오.
 *
 * 상태 머신:
 *   ready  → 캐스팅 버튼 길게 누르기 (힘 충전)
 *   casting → 충전된 힘에 따라 찌가 화면 어딘가에 떨어짐
 *   waiting → 입질 대기 (3~7초 후 무작위 발생)
 *   biting  → "당겨!" 표시. 1.5초 안에 reel 누르면 성공
 *   reeling → 1초 reel 애니메이션 → reward
 *
 * 보상: rarity 가중치로 물고기 결정 + 인벤토리에 추가 + XP/코인 (game_profiles 갱신).
 *
 * 본 시나리오는 카메라 + 가상 물결 오버레이만 — 실제 강가 인식은 추후.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Fish, Timer } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { markStepComplete } from "@/lib/scenario/actions";
import { useGeneratedModel } from "@/lib/asset-forge/useGeneratedModel";
import { fx } from "@/lib/game/fx";
import { ScenarioCameraShell } from "./ScenarioCameraShell";
import type { ScenarioRunnerProps } from "@/lib/scenario/types";
import { cn } from "@/lib/utils";

type FishKey = "minnow" | "bass" | "carp" | "goldfish";

const FISH: Record<
  FishKey,
  { name: string; emoji: string; rarity: "common" | "rare" | "legendary"; xp: number; coins: number }
> = {
  minnow: { name: "송사리", emoji: "🐟", rarity: "common", xp: 8, coins: 4 },
  bass: { name: "배스", emoji: "🐠", rarity: "common", xp: 12, coins: 6 },
  carp: { name: "잉어", emoji: "🐡", rarity: "rare", xp: 30, coins: 18 },
  goldfish: { name: "황금잉어", emoji: "🥇", rarity: "legendary", xp: 80, coins: 50 },
};

function pickFish(forced?: FishKey): FishKey {
  if (forced) return forced;
  const r = Math.random();
  if (r < 0.06) return "goldfish";
  if (r < 0.25) return "carp";
  if (r < 0.65) return "bass";
  return "minnow";
}

type Phase = "ready" | "casting" | "waiting" | "biting" | "reeling" | "done";

export default function FishingScenario({ onExit, onScenarioComplete }: ScenarioRunnerProps) {
  // AI 생성 물고기 모델 (asset-forge active=true 면 자동 로드).
  // 모델이 있을 때는 잡았을 때 화면에 잠깐 보여주고, 없으면 emoji fallback.
  const generatedFish = useGeneratedModel("fish");

  const [phase, setPhase] = useState<Phase>("ready");
  const [castPower, setCastPower] = useState(0); // 0..1
  const [bobberPos, setBobberPos] = useState<{ x: number; y: number } | null>(null);
  const [biteUntilMs, setBiteUntilMs] = useState<number | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const biteCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [biteRemaining, setBiteRemaining] = useState(0);

  const stepMut = useMutation({
    mutationFn: async (step_key: string) =>
      markStepComplete({
        data: { scenario_id: "fishing", step_key },
        headers: await authHeaders(),
      } as Parameters<typeof markStepComplete>[0]),
  });

  // ── Phase: ready → casting (캐스팅 충전) ───────────────────
  const startCharge = useCallback(() => {
    if (phase !== "ready") return;
    holdStartRef.current = performance.now();
    setPhase("casting");
  }, [phase]);

  const releaseCharge = useCallback(() => {
    if (phase !== "casting" || holdStartRef.current == null) return;
    const heldMs = performance.now() - holdStartRef.current;
    const power = Math.min(1, heldMs / 1500); // 1.5초 풀 충전
    setCastPower(power);
    holdStartRef.current = null;

    // 찌 위치 — 충전 클수록 화면 멀리 (높이는 위쪽)
    const x = 0.5 + (Math.random() - 0.5) * 0.2; // 가운데 ±10%
    const y = 0.65 - power * 0.4; // power 가 클수록 위로 (멀리)
    setBobberPos({ x, y });

    fx.capture();
    setPhase("waiting");

    // 3~7초 후 biting
    waitTimerRef.current = setTimeout(
      () => {
        setPhase("biting");
        setBiteUntilMs(performance.now() + 1500);
      },
      3000 + Math.random() * 4000,
    );
  }, [phase]);

  // ── biting phase 카운트다운 ───────────────────────────────
  useEffect(() => {
    if (phase !== "biting" || biteUntilMs == null) return;
    fx.hit();
    biteCountdownRef.current = setInterval(() => {
      const remaining = biteUntilMs - performance.now();
      if (remaining <= 0) {
        // 놓침 — ready 로 복귀
        clearInterval(biteCountdownRef.current!);
        setPhase("ready");
        setBobberPos(null);
        setBiteUntilMs(null);
        fx.miss();
        toast.info("입질을 놓쳤어요…");
        return;
      }
      setBiteRemaining(remaining);
    }, 80);
    return () => {
      if (biteCountdownRef.current) clearInterval(biteCountdownRef.current);
    };
  }, [phase, biteUntilMs]);

  // ── biting → reel 성공 ───────────────────────────────────
  const reel = useCallback(
    (forcedFish?: FishKey) => {
      if (phase !== "biting" && !forcedFish) return;
      if (biteCountdownRef.current) clearInterval(biteCountdownRef.current);
      setPhase("reeling");
      fx.finish();
      setTimeout(() => {
        const f = pickFish(forcedFish);
        const meta = FISH[f];
        toast.success(`${meta.emoji} ${meta.name}! +${meta.xp} XP / +${meta.coins} 코인`);
        stepMut.mutate("catch_one");
        setPhase("done");
        setTimeout(() => onScenarioComplete?.(meta.xp), 1500);
      }, 1000);
    },
    [phase, onScenarioComplete, stepMut],
  );

  // ── 디버그: 송사리 즉시 잡기 (UI 검증용) ─────────────────
  const debugCatchMinnow = useCallback(() => {
    // 모든 타이머 정리 후 reeling 단계로 강제 진입.
    if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
    if (biteCountdownRef.current) clearInterval(biteCountdownRef.current);
    setBobberPos({ x: 0.5, y: 0.45 });
    setBiteUntilMs(null);
    // forced 'minnow' 으로 reel 직행
    setPhase("biting");
    setTimeout(() => reel("minnow"), 50);
  }, [reel]);

  useEffect(() => {
    return () => {
      if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
      if (biteCountdownRef.current) clearInterval(biteCountdownRef.current);
    };
  }, []);

  const phaseLabel = useMemo<{ title: string; sub: string }>(() => {
    switch (phase) {
      case "ready":
        return { title: "캐스팅 준비", sub: "버튼을 길게 눌러 힘을 모으세요" };
      case "casting":
        return { title: "캐스팅 중…", sub: "버튼을 놓으면 던집니다" };
      case "waiting":
        return { title: "입질 대기", sub: "물결을 잘 지켜보세요" };
      case "biting":
        return { title: "당겨!", sub: "지금 릴 버튼!" };
      case "reeling":
        return { title: "릴 감는 중…", sub: "" };
      case "done":
        return { title: "완료!", sub: "" };
    }
  }, [phase]);

  return (
    <ScenarioCameraShell onExit={onExit}>
      {/* 상단 상태 카드 */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-30 mx-auto max-w-md">
        <Card
          className={cn(
            "border-blue-400/40 p-3 text-white shadow-lg backdrop-blur-md",
            phase === "biting" ? "animate-pulse bg-amber-500/90" : "bg-sky-900/85",
          )}
        >
          <header className="flex items-center gap-2">
            <Fish className="h-5 w-5" />
            <h2 className="font-display text-base">{phaseLabel.title}</h2>
            <button
              type="button"
              onClick={onExit}
              className="ml-auto text-xs underline opacity-80"
            >
              나가기
            </button>
          </header>
          <p className="mt-1 text-xs opacity-90">{phaseLabel.sub}</p>

          {phase === "biting" && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <Timer className="h-3.5 w-3.5" />
              <span>{(biteRemaining / 1000).toFixed(1)}s</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full bg-white"
                  style={{ width: `${Math.max(0, (biteRemaining / 1500) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 가상 물결 + 찌 */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {/* 물결 그라데이션 */}
        <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-blue-900/45 via-blue-500/15 to-transparent" />
        {bobberPos && (
          <div
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 text-4xl drop-shadow-lg",
              phase === "biting" && "animate-bounce",
            )}
            style={{ left: `${bobberPos.x * 100}%`, top: `${bobberPos.y * 100}%` }}
          >
            🎣
          </div>
        )}
      </div>

      {/* 캐스팅 진행도 */}
      {phase === "casting" && (
        <CastingMeter holdStartRef={holdStartRef} />
      )}

      {/* 메인 액션 버튼 — 하단 가운데 큰 원 */}
      <div className="pointer-events-auto absolute bottom-8 left-1/2 z-30 -translate-x-1/2 pb-[env(safe-area-inset-bottom)]">
        {phase === "ready" && (
          <button
            type="button"
            onPointerDown={startCharge}
            className="flex h-24 w-24 items-center justify-center rounded-full bg-sky-500 text-base font-bold text-white shadow-2xl active:scale-95"
          >
            캐스팅
          </button>
        )}
        {phase === "casting" && (
          <button
            type="button"
            onPointerUp={releaseCharge}
            onPointerLeave={releaseCharge}
            className="flex h-24 w-24 items-center justify-center rounded-full bg-amber-400 text-base font-bold text-amber-950 shadow-2xl active:scale-95"
          >
            놓기!
          </button>
        )}
        {phase === "biting" && (
          <button
            type="button"
            onClick={() => reel()}
            className="flex h-28 w-28 animate-pulse items-center justify-center rounded-full bg-rose-500 text-lg font-bold text-white shadow-2xl ring-4 ring-rose-300/60 active:scale-95"
          >
            당겨!
          </button>
        )}
        {(phase === "waiting" || phase === "reeling") && (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-700/70 text-xs font-medium text-white/85">
            {phase === "waiting" ? "대기…" : "감는 중…"}
          </div>
        )}
      </div>

      {/* 디버그: 송사리 즉시 잡기 (테스트용) */}
      {(phase === "ready" || phase === "casting" || phase === "waiting") && (
        <button
          type="button"
          onClick={debugCatchMinnow}
          className="pointer-events-auto absolute bottom-44 right-4 z-30 rounded-full bg-fuchsia-500/85 px-3 py-2 text-xs font-bold text-white shadow-lg active:scale-95"
        >
          🐟 테스트: 송사리
        </button>
      )}

      <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[10px] text-white/45">
        {generatedFish.ready
          ? "🐟 AI 생성 물고기 모델 적용됨"
          : "* AI 생성 물고기는 admin/asset-forge 에서 생성하면 자동 적용"}
      </p>
    </ScenarioCameraShell>
  );
}

function CastingMeter({ holdStartRef }: { holdStartRef: React.MutableRefObject<number | null> }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (holdStartRef.current != null) {
        const v = Math.min(1, (performance.now() - holdStartRef.current) / 1500);
        setP(v);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [holdStartRef]);
  return (
    <div className="pointer-events-none absolute bottom-40 left-1/2 z-20 -translate-x-1/2">
      <div className="h-2 w-48 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full bg-gradient-to-r from-sky-300 via-amber-300 to-rose-400"
          style={{ width: `${p * 100}%` }}
        />
      </div>
      <p className="mt-1 text-center text-[10px] text-white/85">힘 {Math.round(p * 100)}%</p>
    </div>
  );
}
