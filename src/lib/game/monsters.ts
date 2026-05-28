export type MonsterRarity = "common" | "rare" | "legendary";

export type MonsterDef = {
  key: string;
  name: string;
  emoji: string;
  rarity: MonsterRarity;
};

export const MONSTERS: MonsterDef[] = [
  { key: "sprout", name: "새싹이", emoji: "🌱", rarity: "common" },
  { key: "petal", name: "꽃돌이", emoji: "🌸", rarity: "common" },
  { key: "pebble", name: "돌맹이", emoji: "🪨", rarity: "common" },
  { key: "breeze", name: "바람이", emoji: "💨", rarity: "rare" },
  { key: "sunbeam", name: "햇살이", emoji: "☀️", rarity: "rare" },
  { key: "moonlet", name: "달빛이", emoji: "🌙", rarity: "rare" },
  { key: "elder", name: "할머니숲", emoji: "🌳", rarity: "legendary" },
  { key: "golden", name: "황금새", emoji: "🐦", rarity: "legendary" },
];

export const RARITY_META: Record<
  MonsterRarity,
  { label: string; xp: number; coins: number; color: string }
> = {
  common: { label: "일반", xp: 12, coins: 6, color: "text-foreground/70" },
  rare: { label: "희귀", xp: 28, coins: 14, color: "text-blue-600" },
  legendary: { label: "전설", xp: 80, coins: 40, color: "text-amber-600" },
};

/** 베타: 50m 이동마다 스폰 시도 */
export const SPAWN_DISTANCE_M = 50;

/** 스폰 유효 시간 */
export const SPAWN_TTL_MIN = 30;

/** 하루 최대 포획 */
export const DAILY_CATCH_LIMIT = 30;

export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 40)) + 1);
}

export function pickMonster(level: number): MonsterDef {
  const roll = Math.random();
  const legendaryChance = Math.min(0.12, 0.04 + level * 0.008);
  const rareChance = Math.min(0.45, 0.22 + level * 0.01);

  let pool: MonsterRarity = "common";
  if (roll < legendaryChance) pool = "legendary";
  else if (roll < legendaryChance + rareChance) pool = "rare";

  const candidates = MONSTERS.filter((m) => m.rarity === pool);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? MONSTERS[0];
}

export function monsterByKey(key: string): MonsterDef | undefined {
  return MONSTERS.find((m) => m.key === key);
}
