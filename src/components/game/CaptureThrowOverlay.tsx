/**
 * POGO-style 포켓볼 던지기 + wiggle 미니게임 오버레이.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  bezierPoint,
  evaluateThrow,
  wiggleCatchChance,
  type ThrowGrade,
} from "@/lib/game/capture-physics";
import { fx } from "@/lib/game/fx";
import type { MonsterRarity } from "@/lib/game/monsters";

type Phase = "aim" | "flying" | "wiggle" | "done";

interface Props {
  active: boolean;
  rarity: MonsterRarity;
  monsterName: string;
  /** 몬스터 화면 중심 (0..1) */
  targetX?: number;
  targetY?: number;
  onCaptureSuccess: () => void;
  onFlee: () => void;
  onMiss?: () => void;
}

const GRADE_LABEL: Record<ThrowGrade, string> = {
  miss: "",
  nice: "Nice!",
  great: "Great!",
  excellent: "Excellent!",
};

export function CaptureThrowOverlay({
  active,
  rarity,
  monsterName,
  targetX = 0.5,
  targetY = 0.38,
  onCaptureSuccess,
  onFlee,
  onMiss,
}: Props) {
  const [phase, setPhase] = useState<Phase>("aim");
  const [ballPos, setBallPos] = useState<{ x: number; y: number } | null>(null);
  const [grade, setGrade] = useState<ThrowGrade>("miss");
  const [wiggleCount, setWiggleCount] = useState(0);
  const [wiggleMax, setWiggleMax] = useState(2);
  const [shakeAnim, setShakeAnim] = useState(false);
  const missCountRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastGradeRef = useRef<ThrowGrade>("nice");

  useEffect(() => {
    if (!active) {
      setPhase("aim");
      setBallPos(null);
      setWiggleCount(0);
      missCountRef.current = 0;
    }
  }, [active]);

  const startWiggle = useCallback(
    (g: ThrowGrade) => {
      lastGradeRef.current = g;
      const shakes = rarity === "legendary" ? 3 : rarity === "rare" ? 2 : 2;
      setWiggleMax(shakes);
      setWiggleCount(0);
      setPhase("wiggle");
      fx.captureBallHit();
    },
    [rarity],
  );

  const runThrowAnim = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }, result: ReturnType<typeof evaluateThrow>) => {
      setPhase("flying");
      const p0 = start;
      const p2 = { x: end.x, y: end.y };
      const p1 = { x: (start.x + end.x) / 2, y: Math.min(start.y, end.y) - 80 };
      let t = 0;
      const step = () => {
        t += 0.06;
        if (t >= 1) {
          if (result.hit) {
            setGrade(result.grade);
            startWiggle(result.grade);
          } else {
            fx.captureBallMiss();
            missCountRef.current += 1;
            onMiss?.();
            if (missCountRef.current >= 5) {
              fx.captureFlee();
              onFlee();
            } else {
              setPhase("aim");
              setBallPos(null);
            }
          }
          return;
        }
        setBallPos(bezierPoint(t, p0, p1, p2));
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    [onFlee, onMiss, startWiggle],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (phase !== "aim" || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    dragRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setBallPos(dragRef.current);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (phase !== "aim" || !dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const end = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const start = dragRef.current;
    dragRef.current = null;

    const mx = targetX * rect.width;
    const my = targetY * rect.height;
    const result = evaluateThrow({
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      monsterCenterX: mx,
      monsterCenterY: my,
      monsterRadius: Math.min(rect.width, rect.height) * 0.12,
    });

    fx.captureBallThrow(result.power);
    runThrowAnim(start, end, result);
  };

  const handleWiggleTap = () => {
    if (phase !== "wiggle") return;
    setShakeAnim(true);
    setTimeout(() => setShakeAnim(false), 200);
    const chance = wiggleCatchChance(rarity, lastGradeRef.current, wiggleCount);
    if (Math.random() < chance) {
      fx.capture();
      setPhase("done");
      onCaptureSuccess();
      return;
    }
    const next = wiggleCount + 1;
    setWiggleCount(next);
    fx.captureWiggle();
    if (next >= wiggleMax) {
      fx.captureFlee();
      onFlee();
    }
  };

  if (!active) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[25] touch-none"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {phase === "aim" && (
        <div className="pointer-events-none absolute bottom-[28%] left-0 right-0 text-center">
          <p className="text-sm font-medium text-white drop-shadow-md">위로 스와이프해 포획구를 던지세요</p>
          <p className="mt-1 text-xs text-white/70">{monsterName}</p>
        </div>
      )}

      {ballPos && (phase === "aim" || phase === "flying") && (
        <div
          className="pointer-events-none absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 bg-gradient-to-br from-red-400 via-white to-red-500 shadow-lg"
          style={{ left: ballPos.x, top: ballPos.y }}
        />
      )}

      {phase === "wiggle" && (
        <button
          type="button"
          className="absolute inset-0 z-30 flex flex-col items-center justify-end pb-[32%]"
          onClick={handleWiggleTap}
        >
          <div
            className={cn(
              "rounded-2xl bg-black/55 px-6 py-4 text-center backdrop-blur-md",
              shakeAnim && "animate-pulse",
            )}
          >
            <p className="text-lg font-bold text-white">
              {GRADE_LABEL[grade] || "명중!"}
            </p>
            <p className="mt-1 text-sm text-amber-200">흔들릴 때 탭!</p>
            <p className="mt-2 text-xs text-white/60">
              {wiggleCount + 1} / {wiggleMax}
            </p>
          </div>
        </button>
      )}
    </div>
  );
}
