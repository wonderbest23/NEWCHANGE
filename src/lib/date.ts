/** 한국어 로케일로 날짜만 표시 (UI용) */
export function formatDateLabel(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(d)
}

/** 시각만 표시 */
export function formatTimeLabel(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat('ko-KR', { timeStyle: 'short' }).format(d)
}

export function dayStartLabel(d: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(d)
}
