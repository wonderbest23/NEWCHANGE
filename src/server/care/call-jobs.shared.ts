/**
 * Pure helpers shared between server and client (no DB access).
 */

/**
 * 현재 시각이 recipient의 통화 가능 시간대 안인지 검사.
 * timezone 변환은 Intl.DateTimeFormat 사용.
 */
export function isWithinCallWindow(
  windowStart: string, // 'HH:MM:SS' or 'HH:MM'
  windowEnd: string,
  timezone: string,
  now: Date = new Date(),
): boolean {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone || "Asia/Seoul",
  });
  const parts = fmt.formatToParts(now);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const cur = Number(hh) * 60 + Number(mm);

  const toMin = (s: string) => {
    const [h = "0", m = "0"] = s.split(":");
    return Number(h) * 60 + Number(m);
  };
  const start = toMin(windowStart);
  const end = toMin(windowEnd);

  if (start <= end) return cur >= start && cur <= end;
  // 자정 가로지르는 경우
  return cur >= start || cur <= end;
}
