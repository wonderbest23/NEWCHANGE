/** 베타 게임 URL 게이트 (네비 미노출, env·쿼리로 제한) */

function env(name: string): string | undefined {
  const vite = (import.meta as { env?: Record<string, string> }).env?.[name];
  if (vite) return vite;
  if (typeof process !== "undefined" && process.env?.[name]) return process.env[name];
  return undefined;
}

export function isBetaGameEnabled(): boolean {
  const flag = env("VITE_BETA_GAME_ENABLED");
  if (flag === "0" || flag === "false") return false;
  return true;
}

export function betaGameGateKey(): string | undefined {
  return env("VITE_BETA_GAME_GATE")?.trim() || undefined;
}

export function checkBetaGameAccess(searchKey?: string): { ok: true } | { ok: false; reason: string } {
  if (!isBetaGameEnabled()) {
    return { ok: false, reason: "베타가 비활성화되어 있어요." };
  }
  const required = betaGameGateKey();
  if (!required) return { ok: true };
  if (searchKey === required) return { ok: true };
  return { ok: false, reason: "베타 접근 키가 필요해요. URL에 ?key=… 를 붙여 주세요." };
}
