/**
 * 커피 만들기 — edu 시나리오 shell.
 *
 * 현재 구현:
 *  - 카메라 위에 4단계 step-by-step UI (분쇄/탬핑/추출/우유)
 *  - 단계별 큰 "다음" 버튼 + 시각 인디케이터
 *  - 실제 3D 에스프레소 머신 모델은 콘텐츠팀 작업 후 슬롯에 끼움 (TODO marker)
 *
 * 추후 확장:
 *  - MediaPipe HandLandmarker 로 사용자가 실제 제스처 (탬핑 누르는 동작) 인식
 *  - Three.js GLB 머신 모델 (포터필터, 그라인더) 합성
 */
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Coffee, Milk, Power, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { markStepComplete } from "@/lib/scenario/actions";
import { scenarioById } from "@/lib/scenario/registry";
import { ScenarioCameraShell } from "./ScenarioCameraShell";
import { StepRunner } from "./StepRunner";
import type { ScenarioRunnerProps } from "@/lib/scenario/types";

const STEP_ICONS = [RotateCw, RotateCw, Power, Milk];

export default function CoffeeScenario({ onExit, onScenarioComplete }: ScenarioRunnerProps) {
  const def = scenarioById("coffee_making");
  const steps = def?.steps ?? [];
  const [idx, setIdx] = useState(0);
  // 각 단계 내부 미니 progress (예: 분쇄 5초, 추출 25초). 실시간 시뮬레이션 느낌.
  const [internalProg, setInternalProg] = useState(0);

  useEffect(() => {
    setInternalProg(0);
    if (idx >= steps.length) return;
    const start = Date.now();
    const total = idx === 2 ? 8000 : 3500; // 추출은 8초, 나머지는 3.5초
    const t = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / total);
      setInternalProg(p);
      if (p >= 1) clearInterval(t);
    }, 80);
    return () => clearInterval(t);
  }, [idx, steps.length]);

  const stepMut = useMutation({
    mutationFn: async (step_key: string) =>
      markStepComplete({
        data: { scenario_id: "coffee_making", step_key },
        headers: await authHeaders(),
      } as Parameters<typeof markStepComplete>[0]),
  });

  const advance = () => {
    const step = steps[idx];
    if (!step) return;
    stepMut.mutate(step.key);
    if (idx >= steps.length - 1) {
      toast.success("☕ 한 잔 완성! 잘 하셨어요");
      onScenarioComplete?.(100);
      return;
    }
    setIdx(idx + 1);
  };

  const Icon = STEP_ICONS[idx] ?? Coffee;

  return (
    <ScenarioCameraShell onExit={onExit}>
      <StepRunner
        steps={steps}
        controlledIndex={idx}
        externalAdvanceSignal={undefined}
        onExit={onExit}
        onScenarioComplete={() => onScenarioComplete?.(100)}
      />

      {/* 가상 머신 인터페이스 — placeholder */}
      <div className="pointer-events-auto absolute left-1/2 top-[20%] z-10 w-[90%] max-w-md -translate-x-1/2">
        <Card className="border-amber-500/40 bg-stone-900/90 p-4 text-white backdrop-blur-md">
          <header className="mb-3 flex items-center gap-2">
            <Icon className="h-6 w-6 text-amber-300" />
            <h2 className="font-display text-lg">{steps[idx]?.title ?? "완료"}</h2>
          </header>
          <p className="mb-3 text-sm text-white/75">{steps[idx]?.spoken}</p>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-white/60">
              <span>진행 중…</span>
              <span>{Math.round(internalProg * 100)}%</span>
            </div>
            <Progress value={internalProg * 100} className="h-2 bg-white/10" />
          </div>

          <button
            type="button"
            disabled={internalProg < 1}
            onClick={advance}
            className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 font-bold text-amber-950 disabled:opacity-50 active:scale-95"
          >
            {internalProg < 1
              ? "잠시만요…"
              : idx >= steps.length - 1
                ? "완료"
                : "다음 단계"}
          </button>

          {/* TODO: 실제 GLB 에스프레소 머신 + AnimationMixer 합성 위치 */}
          <p className="mt-3 text-center text-[10px] text-white/40">
            * 실제 3D 머신 모델은 추후 적용
          </p>
        </Card>
      </div>
    </ScenarioCameraShell>
  );
}
