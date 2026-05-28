/**
 * WalkMonsterScenario — 기존 WalkMonsterBeta 를 시나리오 인터페이스로 감싼다.
 *
 * Scenario registry 에서 lazy-load 가능하도록 default export 만 제공.
 * 기존 WalkMonsterBeta 자체는 인증/동의/AR 풀스크린 흐름 그대로 사용.
 */
import { WalkMonsterBeta } from "@/components/game/WalkMonsterBeta";
import type { ScenarioRunnerProps } from "@/lib/scenario/types";

export default function WalkMonsterScenario(_props: ScenarioRunnerProps) {
  // WalkMonsterBeta 는 자체적으로 동의/카메라/GPS 라이프사이클을 관리한다.
  // gateError 는 라우트 레벨에서 처리되므로 여기서는 undefined.
  return <WalkMonsterBeta />;
}
