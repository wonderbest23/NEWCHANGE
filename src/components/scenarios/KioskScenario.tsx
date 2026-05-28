/**
 * 키오스크 주문 실습 — edu 시나리오 shell.
 *
 * 현재 구현:
 *  - 카메라 위에 가상 키오스크 UI 오버레이 (placeholder).
 *  - 3단계 (메뉴 선택 → 옵션 → 결제) 사용자가 진행.
 *  - 음성 + 자막으로 단계별 안내.
 *  - 실제 3D 키오스크 모델/실제 메뉴 데이터는 콘텐츠팀이 추후 채움.
 *
 * 추후 확장 포인트:
 *  - MediaPipe Object Detector 로 실제 키오스크 스크린 인식 → AR 오버레이 정렬
 *  - 음성 인식으로 사용자 답변 캡처 (Web Speech API)
 */
import { useState } from "react";
import { Coffee, CreditCard, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { markStepComplete } from "@/lib/scenario/actions";
import { scenarioById } from "@/lib/scenario/registry";
import { ScenarioCameraShell } from "./ScenarioCameraShell";
import { StepRunner } from "./StepRunner";
import type { ScenarioRunnerProps } from "@/lib/scenario/types";

const MENU = [
  { id: "americano", name: "아메리카노", price: 3500, icon: Coffee },
  { id: "latte", name: "카페라떼", price: 4500, icon: Coffee },
  { id: "sandwich", name: "샌드위치", price: 6000, icon: ShoppingBag },
];

export default function KioskScenario({ onExit, onScenarioComplete }: ScenarioRunnerProps) {
  const def = scenarioById("kiosk_order");
  const steps = def?.steps ?? [];

  const [stepIdx, setStepIdx] = useState(0);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<"R" | "L" | null>(null);

  const stepCompleteMut = useMutation({
    mutationFn: async (step_key: string) =>
      markStepComplete({
        data: { scenario_id: "kiosk_order", step_key },
        headers: await authHeaders(),
      } as Parameters<typeof markStepComplete>[0]),
  });

  const advance = (stepKey: string) => {
    stepCompleteMut.mutate(stepKey);
    setStepIdx((i) => i + 1);
  };

  return (
    <ScenarioCameraShell onExit={onExit}>
      <StepRunner
        steps={steps}
        controlledIndex={stepIdx}
        onScenarioComplete={() => {
          toast.success("키오스크 주문 실습 완료!");
          onScenarioComplete?.(100);
        }}
        onExit={onExit}
      />

      {/* 가상 키오스크 패널 — 화면 중앙 */}
      <div className="pointer-events-auto absolute left-1/2 top-[18%] z-10 w-[90%] max-w-md -translate-x-1/2">
        <Card className="border-zinc-300/30 bg-white/95 p-4 backdrop-blur-md">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg">☕ 카페 키오스크</h2>
            <span className="text-xs text-foreground/60">실습 모드</span>
          </header>

          {stepIdx === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-foreground/75">메뉴를 골라 주세요</p>
              {MENU.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedItem(m.id);
                      advance("select_menu");
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-background p-3 text-left active:scale-95"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-foreground/70" />
                      <span className="font-medium">{m.name}</span>
                    </div>
                    <span className="text-sm text-foreground/65">{m.price.toLocaleString()}원</span>
                  </button>
                );
              })}
            </div>
          )}

          {stepIdx === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-foreground/75">
                {MENU.find((m) => m.id === selectedItem)?.name} 사이즈 선택
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(["R", "L"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedSize(s)}
                    className={`rounded-xl border-2 p-4 text-center font-semibold active:scale-95 ${
                      selectedSize === s
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background"
                    }`}
                  >
                    {s === "R" ? "Regular" : "Large +500원"}
                  </button>
                ))}
              </div>
              <Button
                size="lg"
                className="h-12 w-full"
                disabled={!selectedSize}
                onClick={() => advance("options")}
              >
                담기
              </Button>
            </div>
          )}

          {stepIdx === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-foreground/75">결제 수단을 선택해 주세요</p>
              <button
                type="button"
                onClick={() => advance("checkout")}
                className="flex w-full items-center gap-3 rounded-xl border-2 border-primary bg-primary/10 p-4 active:scale-95"
              >
                <CreditCard className="h-6 w-6 text-primary" />
                <div className="flex-1 text-left">
                  <p className="font-semibold">카드 결제</p>
                  <p className="text-xs text-foreground/60">단말기에 카드를 가까이 대 주세요</p>
                </div>
              </button>
            </div>
          )}
        </Card>
      </div>
    </ScenarioCameraShell>
  );
}
