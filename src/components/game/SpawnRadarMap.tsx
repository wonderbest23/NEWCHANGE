import { monsterByKey } from "@/lib/game/monsters";
import { offsetMeters, RADAR_RANGE_M } from "@/lib/game/geo";
import { cn } from "@/lib/utils";

type SpawnPin = {
  id: string;
  monster_key: string;
  rarity: string;
  latitude: number;
  longitude: number;
  distance_m: number | null;
  in_range: boolean;
};

type Props = {
  userLat: number | null;
  userLng: number | null;
  spawns: SpawnPin[];
  catchRadiusM: number;
};

export function SpawnRadarMap({ userLat, userLng, spawns, catchRadiusM }: Props) {
  const size = 220;
  const center = size / 2;
  const scale = (size / 2 - 16) / RADAR_RANGE_M;

  if (userLat == null || userLng == null) {
    return (
      <div
        className="mx-auto flex items-center justify-center rounded-full border border-dashed border-border bg-muted/40 text-center text-xs text-foreground/55"
        style={{ width: size, height: size }}
      >
        위치를 불러오면
        <br />
        지도가 보여요
      </div>
    );
  }

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full border-2 border-primary/25 bg-gradient-to-b from-primary/5 to-sage/10"
        aria-hidden
      />
      <div
        className="absolute rounded-full border border-primary/20"
        style={{
          width: catchRadiusM * 2 * scale,
          height: catchRadiusM * 2 * scale,
          left: center - catchRadiusM * scale,
          top: center - catchRadiusM * scale,
        }}
        aria-hidden
      />
      <div
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-white"
        style={{ left: center, top: center }}
        title="내 위치"
      />
      {spawns.map((s) => {
        const { eastM, northM } = offsetMeters(userLat, userLng, s.latitude, s.longitude);
        const x = center + eastM * scale;
        const y = center - northM * scale;
        const def = monsterByKey(s.monster_key);
        if (x < 8 || x > size - 8 || y < 8 || y > size - 8) return null;
        return (
          <div
            key={s.id}
            className={cn(
              "absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-lg shadow-md",
              s.in_range ? "bg-primary/90 ring-2 ring-white" : "bg-background/90 ring-1 ring-border",
            )}
            style={{ left: x, top: y }}
            title={def?.name ?? s.monster_key}
          >
            {def?.emoji ?? "?"}
          </div>
        );
      })}
      <p className="absolute -bottom-6 left-0 right-0 text-center text-[10px] text-foreground/50">
        반경 {catchRadiusM}m 안 · 최대 {RADAR_RANGE_M}m
      </p>
    </div>
  );
}
