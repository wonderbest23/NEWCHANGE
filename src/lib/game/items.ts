export type GameItemKey =
  | "capture_orb"
  | "step_booster"
  | "lucky_charm"
  | "xp_doubler"
  | "radar_extender"
  | "revive_heart";

export type GameItemDef = {
  key: GameItemKey;
  name: string;
  emoji: string;
  price: number;
  description: string;
  /** UI/구매 가능 여부. consume 전용 또는 패시브 효과 표시용 */
  kind: "consumable" | "buff";
};

export const GAME_ITEMS: Record<GameItemKey, GameItemDef> = {
  capture_orb: {
    key: "capture_orb",
    name: "포획구",
    emoji: "🔮",
    price: 25,
    description: "포획 시 사용하면 명중 횟수 -1 · 보너스 코인 +5",
    kind: "consumable",
  },
  step_booster: {
    key: "step_booster",
    name: "걸음 부스터",
    emoji: "👟",
    price: 40,
    description: "다음 스폰까지 거리 10m 단축 (1회)",
    kind: "consumable",
  },
  lucky_charm: {
    key: "lucky_charm",
    name: "행운 부적",
    emoji: "🍀",
    price: 80,
    description: "다음 스폰의 희귀·전설 확률 2배 (1회)",
    kind: "consumable",
  },
  xp_doubler: {
    key: "xp_doubler",
    name: "경험치 두배권",
    emoji: "📜",
    price: 60,
    description: "다음 포획 경험치 2배 (1회)",
    kind: "consumable",
  },
  radar_extender: {
    key: "radar_extender",
    name: "레이더 확장기",
    emoji: "📡",
    price: 100,
    description: "포획 반경 +20m, 30분간 지속",
    kind: "buff",
  },
  revive_heart: {
    key: "revive_heart",
    name: "재도전 하트",
    emoji: "💖",
    price: 150,
    description: "오늘 포획 한도를 +5 늘려요",
    kind: "consumable",
  },
};

export const STARTER_ITEMS: Array<{ key: GameItemKey; quantity: number }> = [
  { key: "capture_orb", quantity: 5 },
  { key: "step_booster", quantity: 2 },
  { key: "lucky_charm", quantity: 1 },
];
