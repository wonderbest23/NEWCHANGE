// 정규화 & 태그 추출 헬퍼 (서버 전용)

export const SEOUL_25 = [
  "강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구",
  "동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구",
  "영등포구","용산구","은평구","종로구","중구","중랑구",
] as const;
export type SeoulGu = (typeof SEOUL_25)[number];

export function normalizeDistrict(input?: string | null): SeoulGu | null {
  if (!input) return null;
  const cleaned = input.replace(/서울특별시|서울시|서울/g, "").trim();
  for (const gu of SEOUL_25) {
    if (cleaned.includes(gu)) return gu;
  }
  return null;
}

export function stripHtml(s?: string | null): string {
  if (!s) return "";
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function parseDateLoose(s?: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{4})[-./년 ]?\s?(\d{1,2})[-./월 ]?\s?(\d{1,2})/);
  if (!m) return null;
  const [_, y, mo, d] = m;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

const TAG_RULES: Array<[RegExp, string[]]> = [
  [/요가|체조|걷기|운동|스트레칭|필라테스/, ["건강", "체육"]],
  [/노래|합창|악기|음악|공연|콘서트/, ["문화", "사회참여"]],
  [/그림|미술|공예|서예|전시/, ["문화"]],
  [/한글|컴퓨터|스마트폰|디지털|교육|강좌/, ["교육"]],
  [/우울|외로|고독|심리|상담/, ["심리", "사회참여"]],
  [/치매|인지|기억력/, ["건강", "치매"]],
  [/식사|급식|반찬|영양/, ["식사", "복지"]],
  [/방문|돌봄|간병/, ["돌봄"]],
  [/예방접종|건강검진|혈압|당뇨/, ["건강", "보건"]],
  [/일자리|취업|봉사/, ["일자리", "사회참여"]],
];

export function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const [re, ts] of TAG_RULES) {
    if (re.test(text)) ts.forEach((t) => tags.add(t));
  }
  return Array.from(tags);
}

export function categorize(name: string, fallback?: string): string {
  if (/복지관|경로당/.test(name)) return "노인복지관";
  if (/건강장수|보건소/.test(name)) return "건강장수센터";
  if (/정신건강|심리/.test(name)) return "정신건강센터";
  if (/도서관|문화/.test(name)) return "문화시설";
  if (/공원|체육/.test(name)) return "체육시설";
  return fallback || "기타";
}

/**
 * `local_resources.resource_type` CHECK 제약조건에 맞는 enum 값으로 매핑.
 * 허용값: welfare_center | senior_center | public_health | program | event |
 *         meal | smartphone_class | health_class | job
 */
export type ResourceTypeEnum =
  | "welfare_center"
  | "senior_center"
  | "public_health"
  | "program"
  | "event"
  | "meal"
  | "smartphone_class"
  | "health_class"
  | "job";

export function mapResourceType(
  name: string,
  description?: string | null,
  fallback: ResourceTypeEnum = "program",
): ResourceTypeEnum {
  const text = `${name} ${description ?? ""}`;
  if (/일자리|취업|구인|구직/.test(text)) return "job";
  if (/스마트폰|디지털|키오스크|컴퓨터|한글/.test(text)) return "smartphone_class";
  if (/건강검진|혈압|당뇨|예방접종|건강교실/.test(text)) return "health_class";
  if (/식사|급식|반찬|도시락|영양/.test(text)) return "meal";
  if (/보건소|건강장수|치매안심/.test(text)) return "public_health";
  if (/경로당/.test(text)) return "senior_center";
  if (/복지관/.test(text)) return "welfare_center";
  if (/축제|공연|전시|행사|특강|체험/.test(text)) return "event";
  return fallback;
}
