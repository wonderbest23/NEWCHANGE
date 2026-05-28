/**
 * AR 낚시 — 동작감 강화 버전.
 *
 * 시각 요소 (전부 SVG + CSS):
 *  - 낚싯대 (우측 하단 고정, 휨 정도가 phase 따라 변함)
 *  - 낚싯줄 (낚싯대 끝 → 찌, quadratic bezier)
 *  - 찌 (빨강+흰색 2색 디스크)
 *  - 물결 (찌 주변 지속 ripple)
 *  - 물 splash (캐스팅 착수 시 파티클 폭발)
 *  - 물고기 실루엣 (릴 단계 — 깊이서 떠오름)
 *  - 잡기 컷씬 (점프 + 회전 + 페이드)
 *
 * 애니메이션 매니지먼트:
 *  - bobberAnim 으로 위치 보간 (cast 포물선, reel 직선)
 *  - rodTension 으로 낚싯대 휨 정도
 *  - requestAnimationFrame 하나로 통합 업데이트
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
import { AssetPreview } from "@/components/asset/AssetPreview";
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

// 화면 정규화 좌표 (0..1)
const ROD_BASE = { x: 0.88, y: 0.98 };
const ROD_TIP_REST = { x: 0.78, y: 0.6 };
const ROD_TIP_PULLED = { x: 0.92, y: 0.7 };
const ROD_TIP_FORWARD = { x: 0.65, y: 0.5 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

// 포물선 호 — t=0 시작, t=1 끝, arc 만큼 위로 솟음
function arcPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  arc: number,
  t: number,
): { x: number; y: number } {
  const x = lerp(from.x, to.x, t);
  const y = lerp(from.y, to.y, t) - arc * 4 * t * (1 - t);
  return { x, y };
}

export default function FishingScenario({ onExit, onScenarioComplete }: ScenarioRunnerProps) {
  const generatedFish = useGeneratedModel("fish");

  const [phase, setPhase] = useState<Phase>("ready");
  const [biteUntilMs, setBiteUntilMs] = useState<number | null>(null);
  const [biteRemaining, setBiteRemaining] = useState(0);
  const [castPowerDisplay, setCastPowerDisplay] = useState(0);
  const [caughtFish, setCaughtFish] = useState<FishKey | null>(null);

  // 찌 현재 위치 (정규화 좌표). 단일 RAF 가 갱신.
  const bobberRef = useRef<{ x: number; y: number; visible: boolean }>({
    x: ROD_TIP_REST.x,
    y: ROD_TIP_REST.y,
    visible: false,
  });
  // 낚싯대 끝 현재 위치
  const rodTipRef = useRef<{ x: number; y: number }>({ ...ROD_TIP_REST });
  // 물고기 실루엣 (릴 단계)
  const fishShadowRef = useRef<{ x: number; y: number; alpha: number }>({
    x: 0,
    y: 0,
    alpha: 0,
  });

  // 애니메이션 명령 큐
  const animRef = useRef<
    | {
        kind: "cast";
        startMs: number;
        from: { x: number; y: number };
        to: { x: number; y: number };
        arc: number;
        duration: number;
      }
    | {
        kind: "reel";
        startMs: number;
        from: { x: number; y: number };
        to: { x: number; y: number };
        duration: number;
      }
    | { kind: "idle"; from: { x: number; y: number } }
    | null
  >(null);

  // 매 프레임 렌더용 force-update 트리거
  const [tick, setTick] = useState(0);

  const holdStartRef = useRef<number | null>(null);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const biteCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 캐스팅 시 발생하는 splash 입자 (~500ms 수명)
  const splashesRef = useRef<
    Array<{ x: number; y: number; vx: number; vy: number; age: number; max: number }>
  >([]);

  // ── server step recording ────────────────────────────────────
  const stepMut = useMutation({
    mutationFn: async (step_key: string) =>
      markStepComplete({
        data: { scenario_id: "fishing", step_key },
        headers: await authHeaders(),
      } as Parameters<typeof markStepComplete>[0]),
  });

  // ── 단일 RAF 루프 ────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    let prevMs = performance.now();
    const tickFn = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - prevMs) / 1000);
      prevMs = now;

      // 캐스팅 충전 진행도 표시
      if (phase === "casting" && holdStartRef.current != null) {
        const p = Math.min(1, (now - holdStartRef.current) / 1500);
        setCastPowerDisplay(p);
        // 낚싯대를 점점 뒤로 (pulled back)
        const k = p;
        rodTipRef.current = lerpPoint(ROD_TIP_REST, ROD_TIP_PULLED, k);
        bobberRef.current.x = rodTipRef.current.x;
        bobberRef.current.y = rodTipRef.current.y;
        bobberRef.current.visible = false;
      }

      // 애니메이션 실행
      const a = animRef.current;
      if (a) {
        if (a.kind === "cast") {
          const elapsed = now - a.startMs;
          const t = Math.min(1, elapsed / a.duration);
          const eased = t; // linear (포물선 자체가 충분히 자연스러움)
          const p = arcPoint(a.from, a.to, a.arc, eased);
          bobberRef.current.x = p.x;
          bobberRef.current.y = p.y;
          bobberRef.current.visible = true;
          // 낚싯대는 앞으로 휘어졌다가 천천히 복귀
          const swing = Math.min(1, elapsed / 250);
          rodTipRef.current = lerpPoint(
            ROD_TIP_FORWARD,
            { x: ROD_TIP_REST.x - 0.02, y: ROD_TIP_REST.y - 0.03 },
            swing,
          );
          if (t >= 1) {
            // 착수! splash 발생 + ripple 시작
            spawnSplash(a.to);
            fx.hit();
            animRef.current = { kind: "idle", from: a.to };
          }
        } else if (a.kind === "reel") {
          const elapsed = now - a.startMs;
          const t = Math.min(1, elapsed / a.duration);
          const eased = 1 - Math.pow(1 - t, 2); // ease-out
          const p = lerpPoint(a.from, a.to, eased);
          bobberRef.current.x = p.x;
          bobberRef.current.y = p.y;
          // 낚싯대 휨: 텐션 강하게
          rodTipRef.current = lerpPoint(ROD_TIP_REST, {
            x: ROD_TIP_REST.x - 0.05,
            y: ROD_TIP_REST.y - 0.08,
          }, 0.85);
          // 물고기 실루엣: 점점 가까이/선명히
          fishShadowRef.current = {
            x: p.x,
            y: p.y + 0.08 * (1 - eased),
            alpha: 0.4 + 0.5 * eased,
          };
          if (t >= 1) {
            animRef.current = null;
            fishShadowRef.current.alpha = 0;
          }
        } else {
          // idle bob
          const bob = Math.sin(now / 600) * 0.006;
          bobberRef.current.x = a.from.x;
          bobberRef.current.y = a.from.y + bob;
          // 입질 시 추가 진동
          if (phase === "biting") {
            bobberRef.current.x += (Math.random() - 0.5) * 0.012;
            bobberRef.current.y += (Math.random() - 0.5) * 0.012;
            // 낚싯대 끝 떨림
            rodTipRef.current = {
              x: ROD_TIP_REST.x + (Math.random() - 0.5) * 0.008,
              y: ROD_TIP_REST.y - 0.02 + (Math.random() - 0.5) * 0.008,
            };
          }
        }
      } else if (phase === "ready" || phase === "done") {
        rodTipRef.current = { ...ROD_TIP_REST };
        bobberRef.current.visible = false;
      }

      // splash 업데이트
      for (const s of splashesRef.current) {
        s.age += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 1.6 * dt; // 중력
      }
      splashesRef.current = splashesRef.current.filter((s) => s.age < s.max);

      setTick((t) => t + 1);
      raf = requestAnimationFrame(tickFn);
    };
    raf = requestAnimationFrame(tickFn);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function spawnSplash(at: { x: number; y: number }) {
    const arr = splashesRef.current;
    for (let i = 0; i < 18; i++) {
      const angle = Math.PI + Math.random() * Math.PI; // 위쪽 반구
      const speed = 0.12 + Math.random() * 0.18;
      arr.push({
        x: at.x,
        y: at.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        max: 0.45 + Math.random() * 0.25,
      });
    }
  }

  // ── ready → casting ─────────────────────────────────────────
  const startCharge = useCallback(() => {
    if (phase !== "ready") return;
    holdStartRef.current = performance.now();
    setPhase("casting");
  }, [phase]);

  // ── casting → waiting (캐스팅 발사) ─────────────────────────
  const releaseCharge = useCallback(() => {
    if (phase !== "casting" || holdStartRef.current == null) return;
    const heldMs = performance.now() - holdStartRef.current;
    const power = Math.min(1, heldMs / 1500);
    holdStartRef.current = null;

    // 목표 위치 — 화면 가운데~상단, 충전 클수록 멀리 (위쪽)
    const targetX = 0.4 + (Math.random() - 0.5) * 0.18;
    const targetY = 0.55 - power * 0.18; // 0.37~0.55

    animRef.current = {
      kind: "cast",
      startMs: performance.now(),
      from: { ...rodTipRef.current },
      to: { x: targetX, y: targetY },
      arc: 0.25 + power * 0.15,
      duration: 600 + (1 - power) * 200,
    };

    fx.capture();
    setPhase("waiting");

    waitTimerRef.current = setTimeout(
      () => {
        setPhase("biting");
        setBiteUntilMs(performance.now() + 1700);
      },
      2500 + Math.random() * 3500,
    );
  }, [phase]);

  // ── biting countdown ────────────────────────────────────────
  useEffect(() => {
    if (phase !== "biting" || biteUntilMs == null) return;
    fx.hit();
    biteCountdownRef.current = setInterval(() => {
      const remaining = biteUntilMs - performance.now();
      if (remaining <= 0) {
        clearInterval(biteCountdownRef.current!);
        setPhase("ready");
        setBiteUntilMs(null);
        animRef.current = null;
        bobberRef.current.visible = false;
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

  // ── biting → reeling → done ─────────────────────────────────
  const reel = useCallback(
    (forcedFish?: FishKey) => {
      if (phase !== "biting" && !forcedFish) return;
      if (biteCountdownRef.current) clearInterval(biteCountdownRef.current);

      const from = { ...bobberRef.current };
      animRef.current = {
        kind: "reel",
        startMs: performance.now(),
        from,
        to: { ...ROD_TIP_REST },
        duration: 1200,
      };
      setPhase("reeling");
      fx.finish();

      setTimeout(() => {
        const f = pickFish(forcedFish);
        setCaughtFish(f);
        const meta = FISH[f];
        toast.success(`${meta.emoji} ${meta.name}! +${meta.xp} XP / +${meta.coins} 코인`);
        stepMut.mutate("catch_one");
        setPhase("done");
        setTimeout(() => {
          onScenarioComplete?.(meta.xp);
        }, 2200);
      }, 1250);
    },
    [phase, onScenarioComplete, stepMut],
  );

  // ── debug: 송사리 즉시 ──────────────────────────────────────
  const debugCatchMinnow = useCallback(() => {
    if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
    if (biteCountdownRef.current) clearInterval(biteCountdownRef.current);
    // 찌를 화면 가운데로 빠르게 던지고 곧바로 reel.
    animRef.current = {
      kind: "cast",
      startMs: performance.now(),
      from: { ...ROD_TIP_REST },
      to: { x: 0.4, y: 0.5 },
      arc: 0.25,
      duration: 500,
    };
    setPhase("waiting");
    setTimeout(() => {
      setPhase("biting");
      setTimeout(() => reel("minnow"), 100);
    }, 600);
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

  const showCatchReveal = phase === "done" && caughtFish;
  const caughtMeta = caughtFish ? FISH[caughtFish] : null;

  // tick 은 RAF 트리거 — 변수만 참조해도 렌더 발생
  void tick;

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
                  style={{ width: `${Math.max(0, (biteRemaining / 1700) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 물 그라데이션 + ripple + 낚싯대 SVG */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-blue-900/50 via-blue-500/15 to-transparent" />

        {/* 물결 ripple — 찌 주변 */}
        {bobberRef.current.visible && (phase === "waiting" || phase === "biting") && (
          <>
            <Ripple
              x={bobberRef.current.x}
              y={bobberRef.current.y}
              delay={0}
              fast={phase === "biting"}
            />
            <Ripple
              x={bobberRef.current.x}
              y={bobberRef.current.y}
              delay={800}
              fast={phase === "biting"}
            />
            <Ripple
              x={bobberRef.current.x}
              y={bobberRef.current.y}
              delay={1600}
              fast={phase === "biting"}
            />
          </>
        )}

        {/* SVG: 낚싯대 + 줄 + 찌 + 물고기 실루엣 + splash */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {/* 물고기 실루엣 (릴 중) */}
          {fishShadowRef.current.alpha > 0 && (
            <ellipse
              cx={fishShadowRef.current.x * 100}
              cy={fishShadowRef.current.y * 100}
              rx={3.5}
              ry={1.2}
              fill={`rgba(20,30,50,${fishShadowRef.current.alpha})`}
            />
          )}

          {/* 낚싯줄 — 낚싯대 끝에서 찌까지 quadratic curve */}
          {bobberRef.current.visible && (
            <path
              d={`M ${rodTipRef.current.x * 100} ${rodTipRef.current.y * 100} Q ${
                (rodTipRef.current.x + bobberRef.current.x) * 50
              } ${(rodTipRef.current.y + bobberRef.current.y) * 50 + 4} ${
                bobberRef.current.x * 100
              } ${bobberRef.current.y * 100}`}
              stroke="rgba(255,255,255,0.75)"
              strokeWidth={0.18}
              fill="none"
            />
          )}

          {/* 낚싯대 — 베이스에서 끝까지 quadratic */}
          <path
            d={`M ${ROD_BASE.x * 100} ${ROD_BASE.y * 100} Q ${
              ((ROD_BASE.x + rodTipRef.current.x) / 2) * 100 + 1.5
            } ${((ROD_BASE.y + rodTipRef.current.y) / 2) * 100 - 2} ${
              rodTipRef.current.x * 100
            } ${rodTipRef.current.y * 100}`}
            stroke="#7c4a1e"
            strokeWidth={0.7}
            strokeLinecap="round"
            fill="none"
          />
          {/* 낚싯대 끝 ring (시각 강조) */}
          <circle
            cx={rodTipRef.current.x * 100}
            cy={rodTipRef.current.y * 100}
            r={0.45}
            fill="#fbbf24"
          />

          {/* 찌 */}
          {bobberRef.current.visible && (
            <g>
              <circle
                cx={bobberRef.current.x * 100}
                cy={bobberRef.current.y * 100}
                r={1.1}
                fill="#dc2626"
              />
              <circle
                cx={bobberRef.current.x * 100}
                cy={bobberRef.current.y * 100 - 0.55}
                r={0.5}
                fill="white"
              />
            </g>
          )}

          {/* Splash 파티클 */}
          {splashesRef.current.map((s, i) => {
            const fade = 1 - s.age / s.max;
            return (
              <circle
                key={i}
                cx={s.x * 100}
                cy={s.y * 100}
                r={0.35 + fade * 0.5}
                fill={`rgba(190,220,255,${fade * 0.85})`}
              />
            );
          })}
        </svg>
      </div>

      {/* 캐스팅 진행도 게이지 */}
      {phase === "casting" && (
        <div className="pointer-events-none absolute bottom-40 left-1/2 z-20 -translate-x-1/2">
          <div className="h-2 w-48 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full bg-gradient-to-r from-sky-300 via-amber-300 to-rose-400 transition-all"
              style={{ width: `${castPowerDisplay * 100}%` }}
            />
          </div>
          <p className="mt-1 text-center text-[10px] text-white/85">
            힘 {Math.round(castPowerDisplay * 100)}%
          </p>
        </div>
      )}

      {/* 메인 액션 버튼 */}
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

      {/* 잡기 컷씬 — AI GLB 물고기 우선, 없으면 emoji */}
      {showCatchReveal && caughtMeta && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
          <div className="animate-fish-catch drop-shadow-2xl">
            <AssetPreview
              kind="fish"
              mode="3d"
              size={280}
              autoRotate
              fallback={<span className="text-[180px]">{caughtMeta.emoji}</span>}
            />
          </div>
          <div className="absolute bottom-1/3 left-0 right-0 text-center">
            <p className="text-2xl font-bold text-white drop-shadow-lg">{caughtMeta.name}</p>
            <p className="mt-1 text-sm text-amber-200">
              +{caughtMeta.xp} XP · +{caughtMeta.coins} 코인
            </p>
          </div>
        </div>
      )}

      {/* 디버그 송사리 */}
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

      {/* 잡기 컷씬 keyframes — inline style 로 */}
      <style>{`
        @keyframes fish-catch {
          0%   { transform: translateY(60vh) rotate(0deg) scale(0.4); opacity: 0; }
          25%  { transform: translateY(0) rotate(-12deg) scale(1.1); opacity: 1; }
          50%  { transform: translateY(-30px) rotate(8deg) scale(1.05); opacity: 1; }
          75%  { transform: translateY(0) rotate(-5deg) scale(1); opacity: 1; }
          100% { transform: translateY(0) rotate(0deg) scale(1); opacity: 0.9; }
        }
        .animate-fish-catch {
          animation: fish-catch 1.4s cubic-bezier(.34,1.56,.64,1) both;
        }
      `}</style>
    </ScenarioCameraShell>
  );
}

// ── 물결 ripple ───────────────────────────────────────────────
function Ripple({
  x,
  y,
  delay,
  fast,
}: {
  x: number;
  y: number;
  delay: number;
  fast: boolean;
}) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    >
      <div
        className="rounded-full border-2 border-white/50"
        style={{
          width: 0,
          height: 0,
          animation: `ripple-expand ${fast ? "1.2s" : "2.4s"} linear ${delay}ms infinite`,
        }}
      />
      <style>{`
        @keyframes ripple-expand {
          0% { width: 0; height: 0; opacity: 0.85; }
          100% { width: 120px; height: 120px; opacity: 0; transform: translate(-60px,-60px); }
        }
      `}</style>
    </div>
  );
}
