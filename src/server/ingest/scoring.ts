// 추천 카드 스코어링 (거리/날짜/태그 가중치 합산)

export type ScoreInput = {
  resource: {
    district?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    tags?: string[];
  };
  user: {
    district?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    interestTags?: string[];
  };
  today?: Date;
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function scoreResource({ resource, user, today = new Date() }: ScoreInput): number {
  let score = 0;

  // 거리 0~30 (또는 자치구 일치 시 +20)
  if (
    resource.latitude != null && resource.longitude != null &&
    user.latitude != null && user.longitude != null
  ) {
    const km = haversineKm(user.latitude, user.longitude, resource.latitude, resource.longitude);
    if (km < 1) score += 30;
    else if (km < 3) score += 22;
    else if (km < 5) score += 14;
    else if (km < 10) score += 6;
  } else if (resource.district && user.district && resource.district === user.district) {
    score += 20;
  }

  // 날짜 임박도 0~20
  if (resource.start_date) {
    const start = new Date(resource.start_date).getTime();
    const diffDays = Math.floor((start - today.getTime()) / 86400000);
    if (diffDays >= 0 && diffDays <= 1) score += 20;
    else if (diffDays <= 3) score += 15;
    else if (diffDays <= 7) score += 10;
    else if (diffDays <= 14) score += 5;
  }

  // 태그 매칭 0~50
  if (user.interestTags?.length && resource.tags?.length) {
    const overlap = resource.tags.filter((t) => user.interestTags!.includes(t)).length;
    score += Math.min(50, overlap * 25);
  }

  return score;
}
