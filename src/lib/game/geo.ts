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

/**
 * 사용자 위치에서 타겟 좌표를 바라보는 방위각.
 * 결과: 정북(N)=0°, 동(E)=90°, 남(S)=180°, 서(W)=270°.
 *
 * 짧은 거리에서는 equirectangular 근사로 충분 (대권 vs 직선 차이 무시).
 */
export function bearingDeg(
  userLat: number,
  userLng: number,
  targetLat: number,
  targetLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(userLat);
  const φ2 = toRad(targetLat);
  const Δλ = toRad(targetLng - userLng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (θ * 180) / Math.PI < 0
    ? ((θ * 180) / Math.PI + 360)
    : (θ * 180) / Math.PI;
}

/** 두 방위각 사이의 시계/반시계 최소 각도 차 (−180 ~ 180). */
export function bearingDelta(currentDeg: number, targetDeg: number): number {
  let delta = targetDeg - currentDeg;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}
