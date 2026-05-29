/** dev 또는 VITE_DEBUG_WALK_MONSTER=1 — 위치 없이 테스트 조우 허용 */
export const WALK_MONSTER_DEBUG_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG_WALK_MONSTER === "1";

/** 테스트용 고정 좌표 (서울숲 인근) */
export const WALK_MONSTER_DEBUG_POS = { lat: 37.5444, lng: 127.0396 } as const;

export function debugUserPos(
  userPos: { lat: number; lng: number } | null,
): { lat: number; lng: number } | null {
  if (userPos) return userPos;
  if (WALK_MONSTER_DEBUG_ENABLED) return { ...WALK_MONSTER_DEBUG_POS };
  return null;
}
