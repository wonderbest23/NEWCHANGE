export type GameItemKey = "capture_orb" | "step_booster";

export type GameItemDef = {
  key: GameItemKey;
  name: string;
  emoji: string;
  price: number;
  description: string;
};

export const GAME_ITEMS: Record<GameItemKey, GameItemDef> = {
  capture_orb: {
    key: "capture_orb",
    name: "포획구",
    emoji: "🔮",
    price: 25,
    description: "포획 시 사용하면 탭 2번·보너스 코인 +5",
  },
  step_booster: {
    key: "step_booster",
    name: "걸음 부스터",
    emoji: "👟",
    price: 40,
    description: "다음 스폰까지 거리 10m 단축 (1회)",
  },
};

export const STARTER_ITEMS: Array<{ key: GameItemKey; quantity: number }> = [
  { key: "capture_orb", quantity: 5 },
  { key: "step_booster", quantity: 2 },
];
