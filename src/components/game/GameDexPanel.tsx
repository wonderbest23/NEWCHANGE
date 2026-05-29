/**
 * 몬스터 도감 — 포획 수 기반 얕은 버전 (Phase 3-C).
 */

import { MONSTERS, RARITY_META } from "@/lib/game/monsters";

interface Props {
  totalCatches: number;
  level: number;
}

export function GameDexPanel({ totalCatches, level }: Props) {
  const cp = level * 10 + totalCatches * 3;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm">
        <span className="text-foreground/70">총 포획</span>
        <span className="font-semibold">{totalCatches}마리</span>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm">
        <span className="text-foreground/70">트레이너 CP</span>
        <span className="font-semibold text-primary">{cp}</span>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {MONSTERS.map((m) => {
          const meta = RARITY_META[m.rarity];
          const seen = totalCatches > 0;
          return (
            <li
              key={m.key}
              className="flex items-center gap-2 rounded-xl border border-border/50 px-3 py-2 text-sm"
            >
              <span className="text-2xl">{seen ? m.emoji : "❓"}</span>
              <div className="min-w-0">
                <p className="truncate font-medium">{seen ? m.name : "???"}</p>
                <p className="text-[10px]" style={{ color: meta.color }}>
                  {seen ? meta.label : "미발견"}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-center text-[10px] text-foreground/45">
        상세 포획 기록·IV는 추후 연동 예정
      </p>
    </div>
  );
}
