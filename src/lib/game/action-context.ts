/**
 * 게임 액션 컨텍스트 — 화면 하단 HUD 의 좌측 primary / 우측 secondary 버튼이
 * 현재 상황(walking / aimed / fishing / pet / coop ...)에 따라 자동으로 바뀌도록
 * 하는 plug-in 시스템.
 *
 * 새 모드를 추가하려면:
 *  1) `GameContext` 의 union 에 새 kind 를 추가하고
 *  2) `buildActionsFor` 의 switch 에 해당 분기를 작성
 *  3) HUD 는 그대로 — primary 1개 + secondaries N개를 출력
 *
 * 의도:
 *  - UI 컴포넌트는 한 종류만 유지. 게임 상태가 변하면 actions 만 갈아끼움.
 *  - 미래 기능(낚시, 펫, 협동)도 같은 추상 위에 빌드.
 */

import type { ReactNode } from "react";
import type { ArSpawn } from "@/components/game/ARWalkSession";

// ─────────────────────────────────────────────────────────────────────────────
// 컨텍스트: 지금 사용자가 무엇을 하고 있는가
// ─────────────────────────────────────────────────────────────────────────────
export type GameContext =
  | { kind: "walking" }
  | {
      kind: "hiding";
      monster: ArSpawn;
      /** 정조준까지의 방향 안내. "left"=왼쪽으로 돌려, "right"=오른쪽, "center"=거의 다 옴 */
      direction: "left" | "right" | "center";
    }
  | { kind: "aimed"; monster: ArSpawn; captureMode: "aim" | "tap" | "rhythm" }
  | { kind: "capturing"; monster: ArSpawn; progress: number /* 0..1 */ }
  // 미래 모드 — 시그니처만 정의. UI 구현은 단계적 추가.
  | { kind: "fishing"; phase: "ready" | "casting" | "waiting" | "biting" | "reeling" }
  | { kind: "pet"; petKey: string; mood: "happy" | "hungry" | "sleepy" | "playful" }
  | { kind: "coop"; partnerName: string; partnerKey: string; pairId: string };

// ─────────────────────────────────────────────────────────────────────────────
// 액션 정의 — HUD 가 받아서 그릴 데이터
// ─────────────────────────────────────────────────────────────────────────────
export type PrimaryTone = "primary" | "amber" | "rose" | "blue" | "neutral";

export interface PrimaryAction {
  /** 큰 라벨 (Default: "공격") */
  label: string;
  /** 작은 부제 (선택). 예: "조준 모드" */
  sublabel?: string;
  /** lucide icon node */
  icon: ReactNode;
  /** 탭/홀드 시작 */
  onPress?: () => void;
  /** 홀드를 끝낼 때 (낚시 캐스팅 같은 chargeable 액션용) */
  onRelease?: () => void;
  /** 길게 누르기 액션 임을 시각적으로 표시 */
  holdable?: boolean;
  /** 시각 톤 */
  tone?: PrimaryTone;
  /** 비활성화 (회색) */
  disabled?: boolean;
  /** 외곽 펄스 강조 — 사용자가 '지금 이거 누르세요' 라고 알려야 할 때 */
  pulse?: boolean;
  /** 외곽 진행도 (0..1) — 캡처 progress 등 ring 형태로 표시 */
  progress?: number;
}

export interface SecondaryAction {
  id: string;
  label: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  /** 우상단 작은 배지 (개수, 상태 등) */
  badge?: string | number;
  active?: boolean;
}

export interface ResolvedActions {
  primary: PrimaryAction | null;
  secondaries: SecondaryAction[];
  /** 화면 중앙 위쪽에 표시할 짧은 안내 */
  centerHint?: ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// 액션 빌더 — context 별로 어떤 버튼을 보여줄지 결정.
// 실제 UI 구현(아이콘 등)은 호출 측에서 inject — 본 모듈은 plain string 키만.
// ─────────────────────────────────────────────────────────────────────────────
export type ActionId =
  | "attack"
  | "menu"
  | "mode"
  | "inventory"
  | "refresh_position"
  | "force_spawn"
  | "exit"
  // 미래 모드용
  | "fishing_cast"
  | "fishing_reel"
  | "fishing_bait"
  | "pet_feed"
  | "pet_play"
  | "pet_pet"
  | "coop_combine"
  | "coop_chat"
  | "coop_leave";

export interface ActionBlueprint {
  primary: {
    id: ActionId;
    label: string;
    sublabel?: string;
    tone?: PrimaryTone;
    holdable?: boolean;
    pulse?: boolean;
    disabled?: boolean;
  } | null;
  secondaryIds: ActionId[];
  centerHintKey?: string;
  centerHintArgs?: Record<string, string | number>;
}

export function blueprintFor(ctx: GameContext): ActionBlueprint {
  switch (ctx.kind) {
    case "walking":
      return {
        primary: { id: "force_spawn", label: "탐색", sublabel: "주변 몬스터 찾기", tone: "primary" },
        secondaryIds: ["refresh_position", "menu", "exit"],
        centerHintKey: "walking",
      };
    case "hiding":
      return {
        primary: null, // 발견 전엔 공격 버튼 안 노출
        secondaryIds: ["menu", "exit"],
        centerHintKey: `hiding.${ctx.direction}`,
      };
    case "aimed":
      return {
        primary: {
          id: "attack",
          label: "공격",
          sublabel: ctx.captureMode === "rhythm" ? "박자에 맞춰" : ctx.captureMode === "tap" ? "연타" : "조준",
          tone: "rose",
          pulse: true,
        },
        secondaryIds: ["mode", "inventory", "menu"],
        centerHintKey: "aimed",
      };
    case "capturing":
      return {
        primary: {
          id: "attack",
          label: "결정타!",
          sublabel: `${Math.round(ctx.progress * 100)}%`,
          tone: "amber",
        },
        secondaryIds: ["menu"],
      };
    case "fishing":
      return {
        primary:
          ctx.phase === "ready"
            ? { id: "fishing_cast", label: "캐스팅", sublabel: "길게 눌러 던지기", tone: "blue", holdable: true }
            : ctx.phase === "biting"
              ? { id: "fishing_reel", label: "당겨!", sublabel: "지금 입질이 와요", tone: "amber", pulse: true }
              : { id: "fishing_reel", label: "릴 감기", sublabel: "기다리는 중", tone: "neutral", disabled: ctx.phase !== "reeling" },
        secondaryIds: ["fishing_bait", "menu"],
        centerHintKey: `fishing.${ctx.phase}`,
      };
    case "pet":
      return {
        primary: { id: "pet_pet", label: "쓰다듬기", tone: "primary" },
        secondaryIds: ["pet_feed", "pet_play", "menu"],
        centerHintKey: `pet.${ctx.mood}`,
        centerHintArgs: { name: ctx.petKey },
      };
    case "coop":
      return {
        primary: { id: "coop_combine", label: "합체", sublabel: `with ${ctx.partnerName}`, tone: "amber" },
        secondaryIds: ["coop_chat", "coop_leave", "menu"],
        centerHintKey: "coop.paired",
      };
  }
}

// 중앙 힌트 텍스트 사전 — UI 에서 i18n 추가하기 쉽도록 키 기반.
export const CENTER_HINTS: Record<string, string> = {
  walking: "걸으며 주변을 탐색하세요",
  "hiding.left": "← 왼쪽으로 천천히 돌리세요",
  "hiding.right": "오른쪽으로 천천히 돌리세요 →",
  "hiding.center": "거의 다 왔어요…",
  aimed: "정조준! 공격 버튼을 누르세요",
  "fishing.ready": "강가에서 길게 눌러 던지기",
  "fishing.casting": "캐스팅 중…",
  "fishing.waiting": "입질을 기다려요",
  "fishing.biting": "지금이에요! 당기세요",
  "fishing.reeling": "릴 감는 중…",
  "pet.happy": "기분이 좋아요",
  "pet.hungry": "배가 고파요",
  "pet.sleepy": "졸려해요",
  "pet.playful": "놀고 싶어해요",
  "coop.paired": "친구와 함께 사냥 중",
};

export function centerHintText(key: string | undefined, args?: Record<string, string | number>): string | undefined {
  if (!key) return undefined;
  let text = CENTER_HINTS[key];
  if (!text) return undefined;
  if (args) {
    for (const [k, v] of Object.entries(args)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
