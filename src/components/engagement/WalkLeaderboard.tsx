import { useQuery } from "@tanstack/react-query";
import { Footprints, Trophy, Medal, Award } from "lucide-react";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import {
  getWalkLeaderboard,
  TIER_META,
  type WalkTier,
} from "@/lib/engagement/walk-leaderboard-actions";
import { cn } from "@/lib/utils";

const TIER_ORDER: WalkTier[] = ["master", "expert", "steady", "starter"];

export function WalkLeaderboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["walk-leaderboard"],
    queryFn: async () =>
      getWalkLeaderboard({ headers: await authHeaders() } as Parameters<typeof getWalkLeaderboard>[0]),
    staleTime: 60_000,
  });

  const me = data?.me ?? null;
  const top = Array.isArray(data?.top) ? data.top : [];

  // 등급별로 그룹핑
  const grouped: Record<WalkTier, typeof top> = {
    master: [],
    expert: [],
    steady: [],
    starter: [],
    none: [],
  };
  for (const row of top) grouped[row.tier].push(row);

  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-border/60 bg-background">
      {/* 헤더 */}
      <div className="flex items-center gap-3 border-b border-border/50 px-5 py-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-soft to-amber-soft">
          <Footprints className="h-5 w-5 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
            동네 산책 순위
          </h2>
          <p className="text-fluid-sm text-foreground/55">등급별로 보여드려요</p>
        </div>
      </div>

      {/* 내 순위 카드 */}
      {me && (
        <div className="px-5 pt-4">
          <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-rose-soft/60 to-amber-soft/40 px-4 py-3">
            <span className="text-2xl" aria-hidden>
              {TIER_META[me.tier].emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                내 등급
              </p>
              <p className="font-display text-base font-semibold text-foreground">
                {TIER_META[me.tier].label}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-semibold tabular-nums text-foreground">
                {me.total > 0 ? `${me.rank}위` : "-"}
              </p>
              <p className="text-[11px] text-foreground/55">{me.total}회 인증</p>
            </div>
          </div>
        </div>
      )}

      {/* 등급별 리스트 */}
      <div className="px-5 pt-4 pb-5">
        {isLoading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-muted/40" />
        ) : top.length === 0 ? (
          <p className="py-8 text-center text-fluid-sm text-foreground/55">
            아직 산책 인증한 이웃이 없어요. 첫 발걸음을 시작해 보세요.
          </p>
        ) : (
          <div className="space-y-4">
            {TIER_ORDER.map((tier) => {
              const list = grouped[tier];
              if (list.length === 0) return null;
              const meta = TIER_META[tier];
              return (
                <div key={tier}>
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <span aria-hidden>{meta.emoji}</span>
                    <h3 className="font-display text-sm font-semibold text-foreground">
                      {meta.label}
                    </h3>
                    <span className="text-[11px] font-medium text-foreground/45">
                      {meta.min}회+
                    </span>
                    <span className="ml-auto text-[11px] font-medium text-foreground/45">
                      {list.length}명
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {list.map((row) => (
                      <li
                        key={row.user_id}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 transition",
                          row.user_id === me?.user_id
                            ? "bg-rose-soft/50 ring-1 ring-primary/30"
                            : "bg-surface/50",
                        )}
                      >
                        <RankBadge rank={row.rank} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-fluid-sm font-semibold text-foreground">
                            {row.nickname}
                            {row.user_id === me?.user_id && (
                              <span className="ml-1.5 text-[10px] font-bold text-primary">
                                나
                              </span>
                            )}
                          </p>
                          {row.region_sigungu && (
                            <p className="truncate text-[11px] text-foreground/50">
                              {row.region_sigungu}
                            </p>
                          )}
                        </div>
                        <p className="font-mono text-sm font-semibold tabular-nums text-foreground/80">
                          {row.total}
                          <span className="ml-0.5 text-[10px] font-normal text-foreground/45">
                            회
                          </span>
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-soft to-rose-soft shadow-soft">
        <Trophy className="h-4 w-4 text-primary" />
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Medal className="h-4 w-4 text-foreground/70" />
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/70">
        <Award className="h-4 w-4 text-foreground/60" />
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 font-mono text-xs font-semibold tabular-nums text-foreground/55">
      {rank}
    </span>
  );
}
