/** 포획 가능 반경 (m) */
export const CATCH_RADIUS_M = 80;

/** 레이더 맵 최대 표시 반경 (m) */
export const RADAR_RANGE_M = 120;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 스폰 좌표를 사용자 기준 동·서(m), 북·남(m) 오프셋으로 */
export function offsetMeters(
  userLat: number,
  userLng: number,
  targetLat: number,
  targetLng: number,
): { eastM: number; northM: number; distanceM: number } {
  const northM = (targetLat - userLat) * 111_320;
  const eastM =
    (targetLng - userLng) * 111_320 * Math.cos((userLat * Math.PI) / 180);
  const distanceM = haversineM(userLat, userLng, targetLat, targetLng);
  return { eastM, northM, distanceM };
}
