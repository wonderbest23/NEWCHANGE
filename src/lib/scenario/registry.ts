/**
 * 시나리오 레지스트리 — 모든 게임/교육 모드의 single source of truth.
 *
 * 새 시나리오 추가는 여기 한 곳만:
 *   1) src/lib/scenario/types.ts 의 ScenarioId 에 키 추가
 *   2) src/components/scenarios/<NAME>.tsx 컴포넌트 작성
 *   3) 아래 SCENARIOS 배열에 정의 추가
 *
 * 라우트(/scenario/$id) 가 자동으로 lazy-load 한다.
 */

import { Coffee, Construction, Fish, Heart, MonitorSmartphone, Users, Footprints } from "lucide-react";
import type { ScenarioDef } from "./types";

export const SCENARIOS: ScenarioDef[] = [
  // ── game ─────────────────────────────────────────────────────
  {
    id: "walk_monster",
    category: "game",
    title: "산책 몬스터",
    subtitle: "걸으면서 잡는 AR 몬스터",
    icon: Footprints,
    accent: "from-emerald-400/30 to-teal-500/30",
    status: "beta",
    blurb: "GPS 기반 몬스터 발견 + 카메라 AR 포획",
    needs: { camera: true, location: true, outdoor: true },
    loader: () =>
      import("@/components/scenarios/WalkMonsterScenario").then((m) => ({ default: m.default })),
  },
  {
    id: "fishing",
    category: "game",
    title: "AR 낚시",
    subtitle: "강가에서 캐스팅 + 입질 + 릴",
    icon: Fish,
    accent: "from-sky-400/30 to-blue-600/30",
    status: "beta",
    blurb: "물결 위에 낚싯대를 던지고 타이밍에 맞춰 당기기",
    needs: { camera: true, location: true },
    loader: () =>
      import("@/components/scenarios/FishingScenario").then((m) => ({ default: m.default })),
  },
  {
    id: "pet",
    category: "game",
    title: "AR 반려견",
    subtitle: "쓰다듬기·먹이·놀기",
    icon: Heart,
    accent: "from-rose-400/30 to-orange-400/30",
    status: "beta",
    blurb: "내 반려견을 매일 돌보며 친밀도 키우기",
    needs: { camera: true, handTracking: true },
    loader: () =>
      import("@/components/scenarios/PetScenario").then((m) => ({ default: m.default })),
  },
  {
    id: "coop",
    category: "game",
    title: "친구와 합체",
    subtitle: "근처 친구와 함께 사냥",
    icon: Users,
    accent: "from-violet-400/30 to-fuchsia-500/30",
    status: "beta",
    blurb: "같은 시간 같은 동네 친구와 짝을 이뤄 보너스 보상",
    needs: { camera: true, location: true },
    loader: () =>
      import("@/components/scenarios/CoopScenario").then((m) => ({ default: m.default })),
  },

  // ── edu ──────────────────────────────────────────────────────
  {
    id: "kiosk_order",
    category: "edu",
    title: "키오스크 주문 실습",
    subtitle: "터치 키오스크에서 메뉴 주문",
    icon: MonitorSmartphone,
    accent: "from-zinc-400/30 to-slate-600/30",
    status: "beta",
    blurb: "카페·패스트푸드 키오스크 결제까지 단계별 안내",
    needs: { camera: true, indoor: true },
    steps: [
      { key: "select_menu", title: "메뉴 고르기", spoken: "원하시는 메뉴를 화면에서 천천히 골라 주세요." },
      { key: "options", title: "옵션 선택", spoken: "사이즈와 옵션을 선택한 뒤 '담기'를 누르세요." },
      { key: "checkout", title: "결제하기", spoken: "결제 수단을 선택하고 카드 또는 휴대폰을 가까이 대 주세요." },
    ],
    loader: () =>
      import("@/components/scenarios/KioskScenario").then((m) => ({ default: m.default })),
  },
  {
    id: "coffee_making",
    category: "edu",
    title: "커피 만들기",
    subtitle: "원두 분쇄 → 추출 → 우유",
    icon: Coffee,
    accent: "from-amber-400/30 to-stone-600/30",
    status: "beta",
    blurb: "에스프레소 머신 단계별 실습",
    needs: { camera: true, handTracking: true, indoor: true },
    steps: [
      { key: "grind", title: "원두 분쇄", spoken: "그라인더를 작동시켜 원두를 분쇄해 주세요." },
      { key: "tamp", title: "탬핑", spoken: "포터필터에 분쇄 원두를 채우고 평평하게 다져 주세요." },
      { key: "extract", title: "에스프레소 추출", spoken: "포터필터를 체결하고 추출 버튼을 누르세요." },
      { key: "milk", title: "우유 스티밍", spoken: "스팀 노즐로 우유를 데우고 라떼아트를 만들어 보세요." },
    ],
    loader: () =>
      import("@/components/scenarios/CoffeeScenario").then((m) => ({ default: m.default })),
  },
  {
    id: "excavator_basics",
    category: "edu",
    title: "포크레인 기본 조작",
    subtitle: "조이스틱 + 시야 확보",
    icon: Construction,
    accent: "from-yellow-400/30 to-orange-600/30",
    status: "beta",
    blurb: "안전 점검 → 시동 → 기본 굴착 동작",
    needs: { camera: true, indoor: true },
    steps: [
      { key: "safety_check", title: "안전 점검", spoken: "주변 사람과 장애물을 확인하세요." },
      { key: "ignition", title: "시동 + 안전벨트", spoken: "안전벨트를 매고 시동을 거세요." },
      { key: "basic_dig", title: "기본 굴착 동작", spoken: "좌측 레버로 붐, 우측으로 버킷을 움직여 흙을 뜨세요." },
    ],
    loader: () =>
      import("@/components/scenarios/ExcavatorScenario").then((m) => ({ default: m.default })),
  },
];

export function scenarioById(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function scenariosByCategory(cat: "game" | "edu"): ScenarioDef[] {
  return SCENARIOS.filter((s) => s.category === cat);
}
