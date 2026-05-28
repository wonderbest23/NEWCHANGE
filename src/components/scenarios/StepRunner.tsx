/**
 * StepRunner — edu 시나리오 공통 진행 엔진.
 *
 * 책임:
 *  - 단계 목록을 받아 현재 단계 표시 (자막 + TTS)
 *  - "완료" 버튼 또는 외부 check 함수로 단계 advance
 *  - 모든 단계 완료 시 onScenarioComplete 콜백
 *  - 서버에 단계 완료 저장 (markStepComplete) — onStepComplete 콜백 통해
 *
 * 시나리오 컴포넌트는 자체 카메라 + 3D + UI 를 가지고, StepRunner 를 상태머신처럼
 * 사용한다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSubtitle } from "@/lib/scenario/voice";
import type { ScenarioStep } from "@/lib/scenario/types";

interface Props {
  steps: ScenarioStep[];
  /** 현재 단계 외부 제어용 (선택). 미제공이면 내부 상태로 관리. */
  controlledIndex?: number;
  /** 단계 완료 시 호출 — 시나리오는 서버 저장 등 처리 */
  onStepComplete?: (step: ScenarioStep, index: number) => void;
  onScenarioComplete?: () => void;
  onExit?: () => void;
  /** 외부 자체 검증 로직 (예: 제스처 인식 후 자동 advance). 미제공 시 "완료" 버튼. */
  externalAdvanceSignal?: number;
}

export function StepRunner({
  steps,
  controlledIndex,
  onStepComplete,
  onScenarioComplete,
  onExit,
  externalAdvanceSignal,
}: Props) {
  const [internalIdx, setInternalIdx] = useState(0);
  const idx = controlledIndex ?? internalIdx;
  const step = steps[idx];
  const isLast = idx >= steps.length - 1;

  const { subtitle, show } = useSubtitle({ autoSpeak: true });

  useEffect(() => {
    if (!step) return;
    show(step.spoken);
  }, [idx, step, show]);

  const advance = useCallback(() => {
    if (!step) return;
    onStepComplete?.(step, idx);
    if (isLast) {
      onScenarioComplete?.();
      return;
    }
    setInternalIdx((i) => Math.min(steps.length - 1, i + 1));
  }, [step, idx, isLast, onStepComplete, onScenarioComplete, steps.length]);

  // externalAdvanceSignal 이 변경되면 자동 advance (시나리오에서 검증 통과 시 트리거)
  useEffect(() => {
    if (externalAdvanceSignal == null) return;
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAdvanceSignal]);

  const progressPct = useMemo(() => ((idx + 1) / steps.length) * 100, [idx, steps.length]);

  if (!step) return null;

  return (
    <>
      {/* 상단 진행 바 */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-30 mx-auto max-w-md">
        <div className="flex items-center gap-2">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:scale-95"
              aria-label="시나리오 나가기"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-[11px] text-white/85">
              <span>
                {idx + 1} / {steps.length} · {step.title}
              </span>
              <span>{Math.round(progressPct)}%</span>
            </div>
            <Progress value={progressPct} className="h-1.5 bg-white/15" />
          </div>
        </div>
      </div>

      {/* 자막 (하단 ¼ 지점) */}
      {subtitle && (
        <div className="pointer-events-none absolute left-0 right-0 top-[60%] z-20 flex justify-center px-4">
          <div className="max-w-md rounded-2xl bg-black/65 px-4 py-3 text-center text-sm font-medium leading-relaxed text-white shadow-xl backdrop-blur-sm">
            {subtitle}
          </div>
        </div>
      )}

      {/* 완료 버튼 (외부 자동 advance 가 없을 때) */}
      {externalAdvanceSignal == null && (
        <div className="pointer-events-auto absolute bottom-6 right-4 z-30 pb-[env(safe-area-inset-bottom)]">
          <Button
            size="lg"
            className="h-14 rounded-full bg-emerald-500 px-5 text-base font-bold shadow-lg active:scale-95"
            onClick={advance}
          >
            {isLast ? (
              <>
                <Check className="mr-1 h-5 w-5" />
                완료
              </>
            ) : (
              <>
                다음 단계
                <ChevronRight className="ml-1 h-5 w-5" />
              </>
            )}
          </Button>
        </div>
      )}
    </>
  );
}
