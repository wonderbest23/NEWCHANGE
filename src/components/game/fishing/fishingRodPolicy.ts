/** `VITE_FISHING_ROD_GLB=0` 일 때만 GLB 비활성 (기본: 모바일 포함 항상 GLB 시도) */
export function shouldUseRodGlb(): boolean {
  return (
    (import.meta as { env?: Record<string, string> }).env?.VITE_FISHING_ROD_GLB !== "0"
  );
}

export function isFishingDebugEnabled(): boolean {
  return (
    (import.meta as { env?: Record<string, string> }).env?.VITE_DEBUG_FISHING === "1"
  );
}
