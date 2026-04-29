/**
 * className 병합 (의존성 없이 최소 구현)
 */
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(' ')
}
