import { useQuery } from "@tanstack/react-query";
import { getMyBadges } from "@/lib/engagement/badges-actions";
import { authHeaders } from "@/lib/auth/server-fn-headers";
import { cn } from "@/lib/utils";

export function BadgesSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-badges"],
    queryFn: async () =>
      getMyBadges({ headers: await authHeaders() } as Parameters<typeof getMyBadges>[0]),
    staleTime: 60_000,
  });

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-border/60 bg-background">
      {/* 헤더 */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-xl tracking-tight text-foreground">나의 칭호</h2>
          {data && (
            <p className="text-fluid-sm font-medium text-foreground/55">
              <span className="text-primary">{data.badges.filter((b) => b.earned).length}</span>
              <span className="text-foreground/40"> / {data.badges.length}</span>
            </p>
          )}
        </div>
        <p className="mt-1 text-fluid-sm text-foreground/55">
          꾸준한 마음을 칭호로 모아요
        </p>
      </div>

      {isLoading || !data ? (
        <div className="px-5 pb-6">
          <div className="h-32 animate-pulse rounded-2xl bg-muted/40" />
        </div>
      ) : (
        <>
          {/* 통계 — 한 줄 분리 라인 */}
          <div className="mx-5 grid grid-cols-3 divide-x divide-border/50 rounded-2xl border border-border/50 bg-surface/60 py-4">
            {[
              { v: data.stats.checkinStreak, l: "연속 안부" },
              { v: data.stats.commentsCount, l: "댓글" },
              { v: data.stats.likesReceived, l: "받은 공감" },
            ].map((s) => (
              <div key={s.l} className="flex flex-col items-center justify-center gap-0.5">
                <p className="font-display text-2xl font-semibold tracking-tight text-foreground">
                  {s.v}
                </p>
                <p className="text-[11px] font-medium text-foreground/55">{s.l}</p>
              </div>
            ))}
          </div>

          {/* 배지 리스트 — 세로 카드, 수평 진행률 */}
          <ul className="mt-4 flex flex-col gap-2 px-3 pb-5">
            {data.badges.map((b) => {
              const pct = b.progress
                ? Math.min(100, (b.progress.current / b.progress.target) * 100)
                : b.earned
                  ? 100
                  : 0;
              return (
                <li
                  key={b.key}
                  className={cn(
                    "group relative flex items-center gap-4 rounded-2xl px-3 py-3 transition-all",
                    b.earned ? "bg-surface/80" : "hover:bg-surface/40",
                  )}
                >
                  {/* 아이콘 원 */}
                  <div
                    className={cn(
                      "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl transition-all",
                      b.earned
                        ? "bg-gradient-to-br from-rose-soft to-amber-soft shadow-soft"
                        : "bg-muted/50 grayscale opacity-60",
                    )}
                  >
                    <span aria-hidden>{b.emoji}</span>
                    {b.earned && (
                      <span
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-soft"
                        aria-label="달성 완료"
                      >
                        ✓
                      </span>
                    )}
                  </div>

                  {/* 본문 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={cn(
                          "truncate font-display text-base font-semibold",
                          b.earned ? "text-foreground" : "text-foreground/70",
                        )}
                      >
                        {b.title}
                      </p>
                      {b.earned ? (
                        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-primary">
                          달성
                        </span>
                      ) : b.progress ? (
                        <span className="shrink-0 font-mono text-xs tabular-nums text-foreground/50">
                          {b.progress.current}
                          <span className="text-foreground/30">/{b.progress.target}</span>
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-fluid-sm text-foreground/55">
                      {b.description}
                    </p>

                    {/* 가는 진행률 바 */}
                    {!b.earned && b.progress && (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/60">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
