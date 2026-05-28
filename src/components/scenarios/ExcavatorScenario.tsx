/**
 * 포크레인 기본 조작 — edu 시나리오 shell.
 *
 * 가상 조이스틱 2개로 단계별 조작 학습.
 * 실제 3D 포크레인 모델 + 물리 시뮬레이션은 추후 콘텐츠팀 작업.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Construction, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { markStepComplete } from "@/lib/scenario/actions";
import { scenarioById } from "@/lib/scenario/registry";
import { ScenarioCameraShell } from "./ScenarioCameraShell";
import { StepRunner } from "./StepRunner";
import { AssetPreview } from "@/components/asset/AssetPreview";
import { cn } from "@/lib/utils";
import type { ScenarioRunnerProps } from "@/lib/scenario/types";

interface Joy {
  x: number; // -1..1
  y: number; // -1..1
}

function VirtualJoystick({
  label,
  onMove,
}: {
  label: string;
  onMove: (j: Joy) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<Joy>({ x: 0, y: 0 });
  const draggingRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    update(e);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    update(e);
  };
  const onPointerUp = () => {
    draggingRef.current = false;
    setKnob({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
  };

  function update(e: React.PointerEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = rect.width / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > r) {
      dx = (dx / dist) * r;
      dy = (dy / dist) * r;
    }
    setKnob({ x: dx / r, y: dy / r });
    onMove({ x: dx / r, y: dy / r });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-medium text-white/85">{label}</span>
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative h-[112px] w-[112px] touch-none rounded-full border-2 border-white/30 bg-black/45 backdrop-blur-sm"
      >
        <div
          className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 shadow-lg"
          style={{
            transform: `translate(calc(-50% + ${knob.x * 30}px), calc(-50% + ${knob.y * 30}px))`,
          }}
        />
      </div>
    </div>
  );
}

export default function ExcavatorScenario({ onExit, onScenarioComplete }: ScenarioRunnerProps) {
  const def = scenarioById("excavator_basics");
  const steps = def?.steps ?? [];
  const [idx, setIdx] = useState(0);
  const [leftJoy, setLeftJoy] = useState<Joy>({ x: 0, y: 0 });
  const [rightJoy, setRightJoy] = useState<Joy>({ x: 0, y: 0 });
  const [boomY, setBoomY] = useState(0); // 시각 표시 (placeholder)
  const [bucketRot, setBucketRot] = useState(0);

  // 우 조이스틱 = 버킷, 좌 조이스틱 = 붐. 천천히 따라감.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setBoomY((y) => y + leftJoy.y * 0.5);
      setBucketRot((r) => r + rightJoy.x * 1.2);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [leftJoy.y, rightJoy.x]);

  const stepMut = useMutation({
    mutationFn: async (step_key: string) =>
      markStepComplete({
        data: { scenario_id: "excavator_basics", step_key },
        headers: await authHeaders(),
      } as Parameters<typeof markStepComplete>[0]),
  });

  const advance = () => {
    const s = steps[idx];
    if (!s) return;
    stepMut.mutate(s.key);
    if (idx >= steps.length - 1) {
      toast.success("기본 조작 학습 완료!");
      onScenarioComplete?.(100);
      return;
    }
    setIdx(idx + 1);
  };

  const StepIcon = idx === 0 ? AlertTriangle : idx === 1 ? KeyRound : Construction;

  return (
    <ScenarioCameraShell onExit={onExit}>
      <StepRunner
        steps={steps}
        controlledIndex={idx}
        onExit={onExit}
        onScenarioComplete={() => onScenarioComplete?.(100)}
      />

      {/* 단계 안내 카드 */}
      <div className="pointer-events-auto absolute left-1/2 top-[16%] z-10 w-[88%] max-w-md -translate-x-1/2">
        <Card className="border-yellow-500/50 bg-yellow-950/90 p-3 text-white backdrop-blur-md">
          <header className="mb-1 flex items-center gap-2">
            <StepIcon className="h-5 w-5 text-yellow-300" />
            <h2 className="font-display text-base">{steps[idx]?.title}</h2>
          </header>
          <p className="text-xs text-white/80">{steps[idx]?.spoken}</p>
          <button
            type="button"
            onClick={advance}
            className="mt-2 w-full rounded-lg bg-yellow-400 px-3 py-2 text-sm font-bold text-yellow-950 active:scale-95"
          >
            {idx >= steps.length - 1 ? "완료" : "다음"}
          </button>
        </Card>
      </div>

      {/* 가운데 — AI GLB 포크레인 우선, 없으면 SVG 실루엣 fallback */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2">
        <AssetPreview
          kind="excavator"
          mode="3d"
          size={280}
          autoRotate
          fallback={
        <svg width={220} height={180} viewBox="0 0 220 180" className={cn("drop-shadow-2xl")}>
          {/* 본체 */}
          <rect x={60} y={100} width={100} height={50} rx={8} fill="#facc15" />
          {/* 캐빈 */}
          <rect x={75} y={70} width={50} height={40} rx={6} fill="#fbbf24" />
          {/* 무한궤도 */}
          <rect x={45} y={150} width={130} height={18} rx={8} fill="#3f3f46" />
          {/* 붐 + 버킷 — 조이스틱 입력 반영 */}
          <g transform={`translate(155 110) rotate(${-30 + boomY * 0.3})`}>
            <rect x={0} y={-6} width={70} height={12} fill="#fbbf24" />
            <g transform={`translate(70 0) rotate(${bucketRot * 0.5})`}>
              <path
                d="M 0 -10 L 25 -16 L 30 8 L 5 14 Z"
                fill="#a16207"
                stroke="#78350f"
                strokeWidth={1}
              />
            </g>
          </g>
        </svg>
          }
        />
      </div>

      {/* 좌/우 가상 조이스틱 */}
      <div className="pointer-events-auto absolute bottom-6 left-4 z-20 pb-[env(safe-area-inset-bottom)]">
        <VirtualJoystick label="붐 / 회전" onMove={setLeftJoy} />
      </div>
      <div className="pointer-events-auto absolute bottom-6 right-4 z-20 pb-[env(safe-area-inset-bottom)]">
        <VirtualJoystick label="버킷 / 암" onMove={setRightJoy} />
      </div>
    </ScenarioCameraShell>
  );
}
