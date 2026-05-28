/**
 * 시나리오 통합 타입 시스템.
 *
 * 본 플랫폼은 두 가지 카테고리를 한 엔진 위에 올린다:
 *   1) game   — 산책 몬스터, 낚시, 펫, 협동 (entertainment)
 *   2) edu    — 키오스크/커피/포크레인 등 직무·생활 교육 (instructional)
 *
 * 둘 다 카메라 + Three.js + MediaPipe 같은 인프라를 공유하지만,
 *  - game 은 자유 흐름 (open-world)
 *  - edu  는 step-by-step 진행 (가이드형)
 *
 * 모든 시나리오는 `ScenarioDef` 로 정의되어 한 곳(registry.ts)에 등록되고,
 * 라우트 `/scenario/$id` 가 동적으로 적절한 React 컴포넌트를 lazy-load 한다.
 */

import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

export type ScenarioCategory = "game" | "edu";

export type ScenarioId =
  // game category
  | "walk_monster"
  | "fishing"
  | "pet"
  | "coop"
  // edu category — 직무/생활 시뮬레이션
  | "kiosk_order"
  | "coffee_making"
  | "excavator_basics";

export interface ScenarioStep {
  /** 단계 식별자 (서버 user_progress 의 step 컬럼 값) */
  key: string;
  /** 사용자에게 보여줄 짧은 제목 */
  title: string;
  /** TTS + 자막용 본문. 한국어, 1~2문장. */
  spoken: string;
  /** 성공 조건 메타 (시나리오별 자체 검증 로직이 해석) */
  goal?: Record<string, unknown>;
}

export interface ScenarioDef {
  id: ScenarioId;
  category: ScenarioCategory;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  /** UI 카드 배경 그라데이션 클래스 (tailwind) */
  accent: string;
  /** 베타·잠금 상태 */
  status: "ready" | "beta" | "locked";
  /** Component lazy import — 라우트에서 React.lazy 로 사용 */
  loader: () => Promise<{ default: ComponentType<ScenarioRunnerProps> }>;
  /** edu 카테고리는 steps 필요. game 은 자체 흐름이라 비워둠. */
  steps?: ScenarioStep[];
  /** 권장 환경: 카메라/위치/소리 등 사용자 안내용 */
  needs?: {
    camera?: boolean;
    location?: boolean;
    handTracking?: boolean;
    indoor?: boolean;
    outdoor?: boolean;
  };
  /** 짧은 미리보기 한 줄 */
  blurb: string;
}

export interface ScenarioRunnerProps {
  scenarioId: ScenarioId;
  /** 종료 콜백 (사용자 X 버튼 등) */
  onExit: () => void;
  /** 단계 완료 시 서버에 저장하는 콜백 */
  onStepComplete?: (stepKey: string, score?: number) => void;
  /** 전체 시나리오 완료 */
  onScenarioComplete?: (totalScore: number) => void;
}
